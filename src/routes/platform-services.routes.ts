import { Router } from "express";
import { z } from "zod";
import {
  createServiceIfUnderQuota,
  deleteService,
  getServiceById,
  getServiceByProjectId,
  getServiceOrganizationId,
  listServices,
  updateService,
} from "../db/services.repository";
import {
  createDependencyIfUnderQuota,
  deleteDependency,
  dependencyExists,
  getDependencyById,
  listDependenciesForService,
  listDependentsForService,
  wouldCreateCycle,
} from "../db/service-dependencies.repository";
import { computeServiceHealth } from "../core/service-health";
import { buildTopologyGraph, findRootCauseCandidates, getFullImpactAnalysis, invalidateImpactAnalysisCache } from "../core/topology";
import { buildServicePortfolio } from "../core/service-portfolio";
import { RESILIENCE_RANGE_HOURS, RESILIENCE_RANGE_VALUES } from "../types/resilience.types";
import { MAX_TOPOLOGY_DEPTH } from "../config/topology.config";
import { getOrganizationById } from "../db/organizations.repository";
import { getProjectOrganizationId } from "../db/projects.repository";
import { getTeamById } from "../db/teams.repository";
import { getEscalationPolicyOrganizationId } from "../db/escalation-policies.repository";
import { getPlanLimits } from "../config/plan-limits";
import { SERVICE_CRITICALITIES, SERVICE_ENVIRONMENTS, SERVICE_LIFECYCLE_STATUSES, SERVICE_OBSERVABILITIES, DEPENDENCY_TYPES, DEPENDENCY_CRITICALITIES } from "../types/service.types";
import type { ServiceCriticality, ServiceEnvironment, ServiceLifecycleStatus, ServiceObservability, DependencyType, DependencyCriticality } from "../types/service.types";
import { authenticate } from "../middleware/authenticate";
import { authorizePlatformOrOrganizationMembership, authorizePlatformOrOrganizationRole } from "../middleware/authorize";
import { AppError, notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import type { OrganizationRoleId } from "../types/organization.types";
import type { Request } from "express";

// Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
// Intelligence" - bestehendes Platform-RBAC (authorizePlatformOwner, siehe
// routes/platform.routes.ts / routes/platform-slo.routes.ts), keine neue
// Rollenlogik.
//
// Phase 24 Sicherheits-Fix: siehe platform-slo.routes.ts / middleware/
// authorize.ts - authorizePlatformOwner() allein liess ueber isGlobalAdmin()
// jeden Projekt-OWNER/ADMIN auf Services JEDER Organisation zugreifen. Ersetzt
// durch authorizePlatformOr Organization{Membership,Role}(), die bei
// konkreter organizationId echte Mitgliedschaft in GENAU dieser Organisation
// verlangt.
export const platformServicesRouter = Router();

const MANAGE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "OPERATOR", "DEVELOPER"];

async function resolveOrgIdFromQuery(req: Request): Promise<string | undefined> {
  return typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
}

async function resolveOrgIdFromBody(req: Request): Promise<string | undefined> {
  return typeof req.body?.organizationId === "string" ? req.body.organizationId : undefined;
}

async function resolveOrgIdForService(req: Request): Promise<string | null> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return null;
  return (await getServiceOrganizationId(id)) ?? null;
}

const listQuerySchema = z.object({
  organizationId: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  criticality: z.enum(SERVICE_CRITICALITIES as [ServiceCriticality, ...ServiceCriticality[]]).optional(),
  environment: z.enum(SERVICE_ENVIRONMENTS as [ServiceEnvironment, ...ServiceEnvironment[]]).optional(),
  lifecycleStatus: z.enum(SERVICE_LIFECYCLE_STATUSES as [ServiceLifecycleStatus, ...ServiceLifecycleStatus[]]).optional(),
  observability: z.enum(SERVICE_OBSERVABILITIES as [ServiceObservability, ...ServiceObservability[]]).optional(),
  health: z.enum(["HEALTHY", "DEGRADED", "CRITICAL", "UNKNOWN"]).optional(),
});

// Auftragspunkt 13 "Service Catalog UI" braucht Health je Zeile (Spalte +
// Filter) - parallelisiert (Promise.all) statt sequentiell, akzeptabel fuer
// realistische Katalog-Groessen (Quota deckelt bei 1000, siehe
// Abschlussbericht "Bekannte Einschraenkungen" fuer die dokumentierte Grenze
// dieses Ansatzes bei sehr grossen Katalogen).
platformServicesRouter.get("/platform/services", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const { organizationId, teamId, projectId, criticality, environment, lifecycleStatus, observability, health } = parsed.data;
  const services = await listServices({
    ...(organizationId !== undefined ? { organizationId } : {}),
    ...(teamId !== undefined ? { teamId } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(criticality !== undefined ? { criticality } : {}),
    ...(environment !== undefined ? { environment } : {}),
    ...(lifecycleStatus !== undefined ? { lifecycleStatus } : {}),
    ...(observability !== undefined ? { observability } : {}),
  });
  const withHealth = await Promise.all(
    services.map(async (service) => ({ ...service, health: await computeServiceHealth(service.id) })),
  );
  res.json(health ? withHealth.filter((s) => s.health.status === health) : withHealth);
});

// Phase 48 "Enterprise Service Portfolio & Strategic Lifecycle Intelligence" -
// MUSS vor der /platform/services/:id-Route registriert sein, sonst wuerde
// Express "portfolio" als :id-Parameter interpretieren (Express matched
// Routen in Registrierungsreihenfolge). Dieselbe range-Konvention wie
// routes/resilience.routes.ts (RESILIENCE_RANGE_VALUES/_HOURS), damit das
// Portfolio denselben Zeitraum-Vertrag wie jede andere Resilience-Ableitung
// nutzt statt eine eigene Zeitraum-Semantik zu erfinden.
const portfolioQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
});

platformServicesRouter.get("/platform/services/portfolio", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = portfolioQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const { organizationId, range } = parsed.data;
  const portfolio = await buildServicePortfolio({ organizationId, hours: RESILIENCE_RANGE_HOURS[range] });
  res.json(portfolio);
});

platformServicesRouter.get("/platform/services/:id", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForService), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Service-ID" });
    return;
  }
  const service = await getServiceById(id);
  if (!service) {
    throw notFoundError("Service nicht gefunden");
  }
  res.json(service);
});

platformServicesRouter.get("/platform/services/:id/health", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForService), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Service-ID" });
    return;
  }
  const service = await getServiceById(id);
  if (!service) {
    throw notFoundError("Service nicht gefunden");
  }
  const [health, rootCauseCandidates] = await Promise.all([computeServiceHealth(id), findRootCauseCandidates(id)]);
  res.json({ ...health, rootCauseCandidates });
});

platformServicesRouter.get("/platform/services/:id/dependencies", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForService), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Service-ID" });
    return;
  }
  const service = await getServiceById(id);
  if (!service) {
    throw notFoundError("Service nicht gefunden");
  }
  res.json(await listDependenciesForService(id));
});

platformServicesRouter.get("/platform/services/:id/dependents", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForService), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Service-ID" });
    return;
  }
  const service = await getServiceById(id);
  if (!service) {
    throw notFoundError("Service nicht gefunden");
  }
  res.json(await listDependentsForService(id));
});

// Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis" -
// dieselbe Route wie seit Phase 23, Antwort um depthGroups/criticalPaths/
// spofCandidates/related/summary erweitert (rein additive Felder,
// affectedServices/maxDepth bleiben unveraendert - kein Breaking Change fuer
// das bestehende Frontend). fresh=true umgeht den 15s-Cache (core/topology.ts).
const impactQuerySchema = z.object({ fresh: z.enum(["true", "false"]).optional() });

platformServicesRouter.get("/platform/services/:id/impact", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForService), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Service-ID" });
    return;
  }
  const service = await getServiceById(id);
  if (!service) {
    throw notFoundError("Service nicht gefunden");
  }
  const parsed = impactQuerySchema.safeParse(req.query);
  const fresh = parsed.success && parsed.data.fresh === "true";
  const analysis = await getFullImpactAnalysis(service, { fresh });
  res.json(analysis);
});

// Auftragspunkt "GET /api/platform/services/:id/critical-path" - dedizierte,
// fokussierte Sicht auf denselben, gecachten Analyseergebnis (kein zweiter
// Berechnungspfad) fuer UIs/Integrationen, die nur Critical Path + SPOF
// brauchen, ohne die vollstaendige (groessere) Impact-Antwort zu laden.
platformServicesRouter.get("/platform/services/:id/critical-path", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForService), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Service-ID" });
    return;
  }
  const service = await getServiceById(id);
  if (!service) {
    throw notFoundError("Service nicht gefunden");
  }
  const analysis = await getFullImpactAnalysis(service);
  res.json({ criticalPaths: analysis.criticalPaths, spofCandidates: analysis.spofCandidates });
});

const createServiceSchema = z
  .object({
    organizationId: z.string().trim().min(1),
    teamId: z.string().trim().min(1).optional(),
    projectId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    technicalOwnerId: z.string().trim().min(1).optional(),
    businessOwner: z.string().trim().max(200).optional(),
    criticality: z.enum(SERVICE_CRITICALITIES as [ServiceCriticality, ...ServiceCriticality[]]).optional(),
    environment: z.enum(SERVICE_ENVIRONMENTS as [ServiceEnvironment, ...ServiceEnvironment[]]).optional(),
    lifecycleStatus: z.enum(SERVICE_LIFECYCLE_STATUSES as [ServiceLifecycleStatus, ...ServiceLifecycleStatus[]]).optional(),
    // Phase 55 "Vollstaendige Projekt-Informationsintegration" - optional,
    // Default OBSERVABLE (siehe Migration 0064/db/services.repository.ts).
    observability: z.enum(SERVICE_OBSERVABILITIES as [ServiceObservability, ...ServiceObservability[]]).optional(),
  })
  .strict();

platformServicesRouter.post("/platform/services", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdFromBody), async (req, res) => {
  const parsed = createServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const organization = await getOrganizationById(parsed.data.organizationId);
  if (!organization) {
    res.status(404).json({ error: "Organisation nicht gefunden" });
    return;
  }
  const limits = getPlanLimits(organization.plan);
  const { organizationId, teamId, projectId, name, description, technicalOwnerId, businessOwner, criticality, environment, lifecycleStatus, observability } = parsed.data;

  // Auftragspunkt 19/20 "Security"/"Tenant Isolation" - ein verlinktes
  // Projekt/Team MUSS zur selben Organisation gehoeren wie der Service,
  // sonst wuerde die Service-Detailseite Health/Incidents/SLOs einer
  // fremden Organisation anzeigen (indirekter Tenant-Leak ueber project_id).
  if (projectId !== undefined) {
    const projectOrgId = await getProjectOrganizationId(projectId);
    if (!projectOrgId || projectOrgId !== organizationId) {
      res.status(404).json({ error: "Projekt nicht gefunden" });
      return;
    }
    // Production Audit (nach Phase 27/28) - echter, live gefundener Bug:
    // "services.project_id" hat eine bewusste UNIQUE-Constraint (Migration
    // 0044, "ein Projekt kann hoechstens einem Service als operative
    // Grundlage dienen"), aber weder hier noch beim PATCH-Handler unten gab
    // es einen Pre-Check dafuer - ein zweiter Versuch, dasselbe Projekt zu
    // verlinken, endete als roher 500 "Interner Serverfehler" (23505 aus
    // Postgres, ungefangen) statt eines sauberen, erwartbaren 409, genau
    // wie es der bereits bestehende dependencyExists()-Pre-Check fuer
    // Dependencies (siehe unten) longst korrekt vormacht.
    if (await getServiceByProjectId(projectId)) {
      res.status(409).json({ error: "Dieses Projekt ist bereits einem anderen Service zugeordnet" });
      return;
    }
  }
  if (teamId !== undefined) {
    const team = await getTeamById(teamId);
    if (!team || team.organizationId !== organizationId) {
      res.status(404).json({ error: "Team nicht gefunden" });
      return;
    }
  }

  const service = await createServiceIfUnderQuota(
    {
      organizationId,
      ...(teamId !== undefined ? { teamId } : {}),
      ...(projectId !== undefined ? { projectId } : {}),
      name,
      ...(description !== undefined ? { description } : {}),
      ...(technicalOwnerId !== undefined ? { technicalOwnerId } : {}),
      ...(businessOwner !== undefined ? { businessOwner } : {}),
      ...(criticality !== undefined ? { criticality } : {}),
      ...(environment !== undefined ? { environment } : {}),
      ...(lifecycleStatus !== undefined ? { lifecycleStatus } : {}),
      ...(observability !== undefined ? { observability } : {}),
      ...(req.userId ? { createdBy: req.userId } : {}),
    },
    limits.servicesPerOrganization,
  );
  if (!service) {
    throw new AppError(409, "CONFLICT", `Plan-Limit erreicht: maximal ${limits.servicesPerOrganization} Services fuer den Plan ${organization.plan}`);
  }
  invalidateImpactAnalysisCache();
  broadcast(createEvent(RealtimeEventType.SERVICE_CREATED, service));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "SERVICE_CREATED",
    category: "SERVICE",
    ...(service.projectId ? { projectId: service.projectId } : {}),
    message: `Service "${service.name}" erstellt`,
    metadata: { serviceId: service.id, organizationId: service.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(service);
});

const updateServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    teamId: z.string().trim().min(1).nullable().optional(),
    projectId: z.string().trim().min(1).nullable().optional(),
    technicalOwnerId: z.string().trim().min(1).nullable().optional(),
    businessOwner: z.string().trim().max(200).nullable().optional(),
    criticality: z.enum(SERVICE_CRITICALITIES as [ServiceCriticality, ...ServiceCriticality[]]).optional(),
    environment: z.enum(SERVICE_ENVIRONMENTS as [ServiceEnvironment, ...ServiceEnvironment[]]).optional(),
    lifecycleStatus: z.enum(SERVICE_LIFECYCLE_STATUSES as [ServiceLifecycleStatus, ...ServiceLifecycleStatus[]]).optional(),
    observability: z.enum(SERVICE_OBSERVABILITIES as [ServiceObservability, ...ServiceObservability[]]).optional(),
    // Phase 27 "Enterprise On-Call & Escalation Management" - "Policy einem
    // Service-Kontext zuordnen" (siehe Migrationskommentar 0049). null loest
    // die Zuordnung wieder.
    escalationPolicyId: z.number().int().positive().nullable().optional(),
  })
  .strict();

platformServicesRouter.patch("/platform/services/:id", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForService), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Service-ID" });
    return;
  }
  const parsed = updateServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const existing = await getServiceById(id);
  if (!existing) {
    throw notFoundError("Service nicht gefunden");
  }
  const { name, description, teamId, projectId, technicalOwnerId, businessOwner, criticality, environment, lifecycleStatus, observability, escalationPolicyId } = parsed.data;

  if (projectId) {
    const projectOrgId = await getProjectOrganizationId(projectId);
    if (!projectOrgId || projectOrgId !== existing.organizationId) {
      res.status(404).json({ error: "Projekt nicht gefunden" });
      return;
    }
    // Production Audit - derselbe Pre-Check wie beim POST-Handler oben
    // (services.project_id ist UNIQUE, Migration 0044); ausgenommen der
    // Fall, dass projectId unveraendert auf den bereits eigenen Wert
    // dieses Service gesetzt wird.
    const conflictingService = await getServiceByProjectId(projectId);
    if (conflictingService && conflictingService.id !== id) {
      res.status(409).json({ error: "Dieses Projekt ist bereits einem anderen Service zugeordnet" });
      return;
    }
  }
  if (teamId) {
    const team = await getTeamById(teamId);
    if (!team || team.organizationId !== existing.organizationId) {
      res.status(404).json({ error: "Team nicht gefunden" });
      return;
    }
  }
  // Tenant Isolation - dieselbe Regel wie bei projectId/teamId oben: eine
  // Policy einer FREMDEN Organisation darf niemals einem Service zugeordnet
  // werden koennen (sonst koennte ein Incident dieser Organisation eine
  // Eskalation an eine fremde Organisation ausloesen).
  if (escalationPolicyId) {
    const policyOrgId = await getEscalationPolicyOrganizationId(escalationPolicyId);
    if (!policyOrgId || policyOrgId !== existing.organizationId) {
      res.status(404).json({ error: "Escalation Policy nicht gefunden" });
      return;
    }
  }

  const updated = await updateService(id, {
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(teamId !== undefined ? { teamId } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(technicalOwnerId !== undefined ? { technicalOwnerId } : {}),
    ...(businessOwner !== undefined ? { businessOwner } : {}),
    ...(criticality !== undefined ? { criticality } : {}),
    ...(environment !== undefined ? { environment } : {}),
    ...(lifecycleStatus !== undefined ? { lifecycleStatus } : {}),
    ...(observability !== undefined ? { observability } : {}),
    ...(escalationPolicyId !== undefined ? { escalationPolicyId } : {}),
  });
  if (!updated) {
    throw notFoundError("Service nicht gefunden");
  }
  invalidateImpactAnalysisCache();
  broadcast(createEvent(RealtimeEventType.SERVICE_UPDATED, updated));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "SERVICE_UPDATED",
    category: "SERVICE",
    ...(updated.projectId ? { projectId: updated.projectId } : {}),
    message: `Service "${updated.name}" aktualisiert`,
    metadata: { serviceId: updated.id, organizationId: updated.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

platformServicesRouter.delete("/platform/services/:id", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForService), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Service-ID" });
    return;
  }
  const existing = await getServiceById(id);
  if (!existing) {
    throw notFoundError("Service nicht gefunden");
  }
  await deleteService(id);
  invalidateImpactAnalysisCache();
  broadcast(createEvent(RealtimeEventType.SERVICE_DELETED, { id: existing.id, organizationId: existing.organizationId, name: existing.name }));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "SERVICE_DELETED",
    category: "SERVICE",
    ...(existing.projectId ? { projectId: existing.projectId } : {}),
    message: `Service "${existing.name}" geloescht`,
    metadata: { serviceId: existing.id, organizationId: existing.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(204).end();
});

const createDependencySchema = z
  .object({
    targetServiceId: z.number().int().positive(),
    dependencyType: z.enum(DEPENDENCY_TYPES as [DependencyType, ...DependencyType[]]),
    criticality: z.enum(DEPENDENCY_CRITICALITIES as [DependencyCriticality, ...DependencyCriticality[]]).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .strict();

platformServicesRouter.post("/platform/services/:id/dependencies", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForService), async (req, res) => {
  const sourceId = Number(req.params.id);
  if (!Number.isInteger(sourceId)) {
    res.status(400).json({ error: "Ungueltige Service-ID" });
    return;
  }
  const parsed = createDependencySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const source = await getServiceById(sourceId);
  if (!source) {
    throw notFoundError("Service nicht gefunden");
  }
  const target = await getServiceById(parsed.data.targetServiceId);
  if (!target) {
    res.status(404).json({ error: "Ziel-Service nicht gefunden" });
    return;
  }
  // Auftragspunkt 20 "Tenant Isolation" - "Bevorzugt: Cross-Organization
  // Dependencies verbieten." Auftragspunkt 7 "Cross-Team Dependency, wenn
  // Team-Isolation dies verbietet" - hier ebenfalls verboten, da eine
  // Kante zwischen zwei verschiedenen Teams die Team-Sichtgrenze fuer
  // Dependency-Daten aufweichen wuerde.
  if (source.organizationId !== target.organizationId) {
    res.status(400).json({ error: "Cross-Organization Dependencies sind nicht erlaubt" });
    return;
  }
  if (sourceId === parsed.data.targetServiceId) {
    res.status(400).json({ error: "Ein Service kann nicht von sich selbst abhaengen" });
    return;
  }
  if (await dependencyExists(sourceId, parsed.data.targetServiceId)) {
    res.status(409).json({ error: "Diese Dependency existiert bereits" });
    return;
  }
  // Direkte Umkehr-Kante verhindern (Auftragspunkt 4: die Beziehung wird
  // nur EINMAL gerichtet gespeichert).
  if (await dependencyExists(parsed.data.targetServiceId, sourceId)) {
    res.status(409).json({ error: "Die umgekehrte Abhaengigkeit existiert bereits - eine Beziehung wird nur einmal gerichtet gespeichert" });
    return;
  }

  const organization = await getOrganizationById(source.organizationId);
  if (!organization) {
    res.status(404).json({ error: "Organisation nicht gefunden" });
    return;
  }
  const limits = getPlanLimits(organization.plan);
  const dependency = await createDependencyIfUnderQuota(
    {
      organizationId: source.organizationId,
      sourceServiceId: sourceId,
      targetServiceId: parsed.data.targetServiceId,
      dependencyType: parsed.data.dependencyType,
      ...(parsed.data.criticality !== undefined ? { criticality: parsed.data.criticality } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(req.userId ? { createdBy: req.userId } : {}),
    },
    limits.dependenciesPerOrganization,
  );
  if (dependency === "CONFLICT") {
    // Race verloren: eine parallele Anfrage hat dieselbe Kante zwischen dem
    // dependencyExists()-Pre-Check oben und diesem INSERT bereits angelegt
    // (siehe Kommentar in db/service-dependencies.repository.ts).
    res.status(409).json({ error: "Diese Dependency existiert bereits" });
    return;
  }
  if (!dependency) {
    throw new AppError(409, "CONFLICT", `Plan-Limit erreicht: maximal ${limits.dependenciesPerOrganization} Dependencies fuer den Plan ${organization.plan}`);
  }

  const cyclic = await wouldCreateCycle(sourceId, parsed.data.targetServiceId, MAX_TOPOLOGY_DEPTH);
  invalidateImpactAnalysisCache();
  broadcast(createEvent(RealtimeEventType.DEPENDENCY_CREATED, dependency));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "DEPENDENCY_CREATED",
    category: "SERVICE",
    message: `Dependency "${source.name}" -> "${target.name}" erstellt`,
    metadata: { dependencyId: dependency.id, organizationId: dependency.organizationId, sourceServiceId: sourceId, targetServiceId: parsed.data.targetServiceId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json({ ...dependency, cyclic });
});

platformServicesRouter.delete("/platform/services/:id/dependencies/:dependencyId", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForService), async (req, res) => {
  const sourceId = Number(req.params.id);
  const dependencyId = Number(req.params.dependencyId);
  if (!Number.isInteger(sourceId) || !Number.isInteger(dependencyId)) {
    res.status(400).json({ error: "Ungueltige ID" });
    return;
  }
  const dependency = await getDependencyById(dependencyId);
  // Echter, beim Live-E2E-Test gefundener Bug: bevor db/service-dependencies.
  // repository.ts#mapRow die BIGSERIAL-Fremdschluessel ehrlich in echte
  // Number()s parste, lieferte der pg-Treiber sie als STRING - dieser
  // Vergleich war dadurch IMMER wahr (String !== Number), Loeschen einer
  // Dependency war fuer JEDEN Aufrufer permanent unmoeglich. Mit der
  // Normalisierung an der Repository-Grenze ist ein einfacher "!=="
  // wieder korrekt.
  if (!dependency || dependency.sourceServiceId !== sourceId) {
    throw notFoundError("Dependency nicht gefunden");
  }
  await deleteDependency(dependencyId);
  invalidateImpactAnalysisCache();
  broadcast(createEvent(RealtimeEventType.DEPENDENCY_DELETED, { id: dependency.id, organizationId: dependency.organizationId }));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "DEPENDENCY_DELETED",
    category: "SERVICE",
    message: `Dependency #${dependency.id} geloescht`,
    metadata: { dependencyId: dependency.id, organizationId: dependency.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(204).end();
});

const topologyQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  teamId: z.string().trim().min(1).optional(),
});

platformServicesRouter.get("/platform/topology", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = topologyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  res.json(await buildTopologyGraph(parsed.data.organizationId, parsed.data.teamId));
});
