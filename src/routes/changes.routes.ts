import { Router } from "express";
import { z } from "zod";
import type { Request } from "express";
import {
  approveChange,
  cancelChange,
  completeChange,
  createChange,
  deleteChange,
  failChange,
  getChangeById,
  getChangeOrganizationId,
  listChanges,
  listChangesForServiceIds,
  listServiceIdsForChange,
  listServiceIdsForChanges,
  rejectChange,
  replaceChangeServices,
  scheduleChange,
  startChange,
  updateChange,
} from "../db/changes.repository";
import { getServicesByIds, getServiceOrganizationId } from "../db/services.repository";
import { getIncidents } from "../db/incidents.repository";
import { getOrganizationById } from "../db/organizations.repository";
import { getDeploymentById } from "../db/deployments.repository";
import { listAuditLog } from "../db/audit-log.repository";
import { getFullImpactAnalysis } from "../core/topology";
import { enrichAffectedServicesWithStatus } from "../core/service-resilience";
import { getChangeControlEffectiveness } from "../core/control-effectiveness";
import { RESILIENCE_RANGE_HOURS, RESILIENCE_RANGE_VALUES } from "../types/resilience.types";
import { analyzeChangeRisk, isSafetyBlockOverridable } from "../core/change-risk";
import { createMaintenanceWindowsForChangeStart, endMaintenanceWindowsForChange } from "../core/change-lifecycle";
import { listMaintenanceWindows } from "../db/maintenance.repository";
import { authenticate } from "../middleware/authenticate";
import { authorizePlatformOrOrganizationMembership, authorizePlatformOrOrganizationRole } from "../middleware/authorize";
import { AppError, notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import {
  CHANGE_TYPES,
  CHANGE_RISKS,
  CHANGE_CATEGORIES,
  CHANGE_STATUSES,
  MAX_SERVICES_PER_CHANGE,
  DEFAULT_CHANGE_CORRELATION_WINDOW_MINUTES,
  MAX_CHANGE_CORRELATION_WINDOW_MINUTES,
} from "../types/change.types";
import type { ChangeType, ChangeRisk, ChangeCategory, ChangeStatus, ChangeWithServices } from "../types/change.types";
import type { OrganizationRoleId } from "../types/organization.types";

// Auftragspunkt 6 "Incident Correlation" - exportiert fuer GET /incidents/
// :id/recent-changes (routes/incidents.routes.ts), identisches Muster wie
// resolveDeploymentCorrelationWindowMinutes() in deployments.routes.ts.
export function resolveChangeCorrelationWindowMinutes(req: Request): number {
  const raw = Number(req.query.windowMinutes);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_CHANGE_CORRELATION_WINDOW_MINUTES;
  return Math.min(raw, MAX_CHANGE_CORRELATION_WINDOW_MINUTES);
}

// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk" - dieselbe RBAC-Struktur wie routes/escalation-policies.routes.ts/
// routes/on-call.routes.ts (Phase 24/27): authorizePlatformOrOrganization
// {Membership,Role}() von Anfang an (keine zu breite authorizePlatformOwner()
// -Pruefung, die in frueheren Phasen bereits einmal zu einem echten
// Cross-Tenant-Bug fuehrte).
export const changesRouter = Router();

const MANAGE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "OPERATOR", "DEVELOPER"];
// Genehmigung ist bewusst eine engere Rollen-Teilmenge als MANAGE_ROLES -
// eine Governance-Aktion, die typischerweise NICHT von derselben
// Rollenstufe ausgefuehrt wird, die auch Changes anlegt/startet.
const APPROVE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN"];

async function resolveOrgIdFromQuery(req: Request): Promise<string | undefined> {
  return typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
}
async function resolveOrgIdFromBody(req: Request): Promise<string | undefined> {
  return typeof req.body?.organizationId === "string" ? req.body.organizationId : undefined;
}
async function resolveOrgIdForChange(req: Request): Promise<string | null> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return null;
  return (await getChangeOrganizationId(id)) ?? null;
}

async function attachServiceIds(changes: Awaited<ReturnType<typeof listChanges>>): Promise<ChangeWithServices[]> {
  const serviceIdsByChange = await listServiceIdsForChanges(changes.map((c) => c.id));
  return changes.map((c) => ({ ...c, serviceIds: serviceIdsByChange.get(c.id) ?? [] }));
}

// Auftragspunkt 7 "Deployment Intelligence" - "Change mit Deployment
// verbinden": das referenzierte Deployment muss zu einem Projekt gehoeren,
// das ueber mindestens einen der (bereits organisationsgeprueften)
// zugeordneten Services erreichbar ist - sonst koennte ein Change
// faelschlich ein Deployment eines fachlich unabhaengigen Projekts
// referenzieren. Gibt bei Erfolg nichts zurueck, wirft sonst eine 404.
async function validateDeploymentLink(deploymentId: number, serviceIds: number[]): Promise<void> {
  const deployment = await getDeploymentById(deploymentId);
  if (!deployment) {
    throw notFoundError("Deployment nicht gefunden");
  }
  if (serviceIds.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Ein Deployment kann nur verknuepft werden, wenn der Change bereits mindestens einem Service zugeordnet ist");
  }
  const services = await getServicesByIds(serviceIds);
  if (!services.some((s) => s.projectId === deployment.projectId)) {
    throw new AppError(400, "VALIDATION_ERROR", "Das Deployment gehoert zu keinem der dem Change zugeordneten Services");
  }
}

// ---------------------------------------------------------------------------
// List / Detail
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(CHANGE_STATUSES as [ChangeStatus, ...ChangeStatus[]]).optional(),
  risk: z.enum(CHANGE_RISKS as [ChangeRisk, ...ChangeRisk[]]).optional(),
  changeType: z.enum(CHANGE_TYPES as [ChangeType, ...ChangeType[]]).optional(),
  category: z.enum(CHANGE_CATEGORIES as [ChangeCategory, ...ChangeCategory[]]).optional(),
  serviceId: z.coerce.number().int().positive().optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

changesRouter.get("/changes", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const { organizationId, status, risk, changeType, category, serviceId, from, to, limit } = parsed.data;
  const changes = await listChanges({
    organizationId,
    ...(status ? { status } : {}),
    ...(risk ? { risk } : {}),
    ...(changeType ? { changeType } : {}),
    ...(category ? { category } : {}),
    ...(serviceId !== undefined ? { serviceId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(limit !== undefined ? { limit } : {}),
  });
  res.json(await attachServiceIds(changes));
});

// Phase 60 "Enterprise Operational Policy & Control Effectiveness" - reine
// Lese-Aggregation ueber bereits bestehende Controls/Evidence (Phase 28/29),
// siehe core/control-effectiveness.ts. VOR /changes/:id registriert (sonst
// wuerde Express "control-effectiveness" als :id-Parameter fehlinterpretieren
// - dieselbe bereits dokumentierte Reihenfolge-Falle wie
// /platform/services/portfolio vs. /platform/services/:id, Phase 48).
const controlEffectivenessQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
});

changesRouter.get("/changes/control-effectiveness", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = controlEffectivenessQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const { organizationId, range } = parsed.data;
  const summary = await getChangeControlEffectiveness({ organizationId, hours: RESILIENCE_RANGE_HOURS[range] });
  res.json(summary);
});

changesRouter.get("/changes/:id", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const change = await getChangeById(id);
  if (!change) {
    throw notFoundError("Change nicht gefunden");
  }
  const serviceIds = await listServiceIdsForChange(id);
  // Auftragspunkt 7 "Deployment Intelligence" - "Deployment-Status/
  // -Zeitpunkt anzeigen": das verknuepfte Deployment wird hier einmalig
  // eingebettet (keine zweite Frontend-Route/kein zweiter Hook noetig,
  // kein N+1-Risiko - dies ist die Einzel-Detailroute, nicht die Liste).
  const deployment = change.deploymentId ? await getDeploymentById(change.deploymentId) : null;
  res.json({ ...change, serviceIds, deployment });
});

// ---------------------------------------------------------------------------
// Create / Update / Delete
// ---------------------------------------------------------------------------

const createSchema = z
  .object({
    organizationId: z.string().trim().min(1),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).optional(),
    changeType: z.enum(CHANGE_TYPES as [ChangeType, ...ChangeType[]]).optional(),
    category: z.enum(CHANGE_CATEGORIES as [ChangeCategory, ...ChangeCategory[]]).optional(),
    risk: z.enum(CHANGE_RISKS as [ChangeRisk, ...ChangeRisk[]]).optional(),
    riskAssessment: z.string().trim().max(4000).optional(),
    rollbackPlan: z.string().trim().max(4000).optional(),
    ownerId: z.string().trim().min(1).optional(),
    plannedStartAt: z.coerce.date().optional(),
    plannedEndAt: z.coerce.date().optional(),
    emergencyJustification: z.string().trim().max(2000).optional(),
    serviceIds: z.array(z.number().int().positive()).max(MAX_SERVICES_PER_CHANGE).optional(),
    deploymentId: z.number().int().positive().optional(),
  })
  .strict()
  .refine((d) => d.changeType !== "EMERGENCY" || Boolean(d.emergencyJustification), {
    message: "emergencyJustification ist fuer changeType=EMERGENCY erforderlich",
  })
  .refine((d) => !d.plannedStartAt || !d.plannedEndAt || d.plannedEndAt > d.plannedStartAt, {
    message: "plannedEndAt muss nach plannedStartAt liegen",
  });

changesRouter.post("/changes", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdFromBody), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const organization = await getOrganizationById(parsed.data.organizationId);
  if (!organization) {
    res.status(404).json({ error: "Organisation nicht gefunden" });
    return;
  }

  // Tenant Isolation - jeder referenzierte Service MUSS zur selben
  // Organisation gehoeren (sonst koennte ein Change eine fremde
  // Organisation ueber die automatische Wartungsfenster-Erzeugung
  // beeinflussen).
  const serviceIds = parsed.data.serviceIds ?? [];
  if (serviceIds.length > 0) {
    const services = await getServicesByIds(serviceIds);
    if (services.length !== serviceIds.length || services.some((s) => s.organizationId !== parsed.data.organizationId)) {
      res.status(404).json({ error: "Mindestens ein Service wurde nicht gefunden" });
      return;
    }
  }

  if (parsed.data.deploymentId !== undefined) {
    await validateDeploymentLink(parsed.data.deploymentId, serviceIds);
  }

  const { organizationId, title, description, changeType, category, risk, riskAssessment, rollbackPlan, ownerId, plannedStartAt, plannedEndAt, emergencyJustification, deploymentId } = parsed.data;
  const change = await createChange({
    organizationId,
    title,
    ...(description !== undefined ? { description } : {}),
    ...(changeType !== undefined ? { changeType } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(risk !== undefined ? { risk } : {}),
    ...(riskAssessment !== undefined ? { riskAssessment } : {}),
    ...(rollbackPlan !== undefined ? { rollbackPlan } : {}),
    ...(ownerId !== undefined ? { ownerId } : {}),
    ...(plannedStartAt !== undefined ? { plannedStartAt: plannedStartAt.toISOString() } : {}),
    ...(plannedEndAt !== undefined ? { plannedEndAt: plannedEndAt.toISOString() } : {}),
    ...(emergencyJustification !== undefined ? { emergencyJustification } : {}),
    ...(deploymentId !== undefined ? { deploymentId } : {}),
    ...(req.userId ? { createdBy: req.userId } : {}),
  });
  if (serviceIds.length > 0) {
    await replaceChangeServices(change.id, serviceIds);
  }

  broadcast(createEvent(RealtimeEventType.CHANGE_CREATED, change));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CHANGE_CREATED",
    category: "CHANGE",
    message: `Change "${change.title}" erstellt (${change.changeType}, Risiko ${change.risk})`,
    metadata: { changeId: change.id, organizationId: change.organizationId, changeType: change.changeType, risk: change.risk },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json({ ...change, serviceIds });
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    changeType: z.enum(CHANGE_TYPES as [ChangeType, ...ChangeType[]]).optional(),
    category: z.enum(CHANGE_CATEGORIES as [ChangeCategory, ...ChangeCategory[]]).optional(),
    risk: z.enum(CHANGE_RISKS as [ChangeRisk, ...ChangeRisk[]]).optional(),
    riskAssessment: z.string().trim().max(4000).nullable().optional(),
    rollbackPlan: z.string().trim().max(4000).nullable().optional(),
    ownerId: z.string().trim().min(1).nullable().optional(),
    plannedStartAt: z.coerce.date().nullable().optional(),
    plannedEndAt: z.coerce.date().nullable().optional(),
    emergencyJustification: z.string().trim().max(2000).nullable().optional(),
    serviceIds: z.array(z.number().int().positive()).max(MAX_SERVICES_PER_CHANGE).optional(),
    deploymentId: z.number().int().positive().nullable().optional(),
  })
  .strict();

changesRouter.patch("/changes/:id", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const existing = await getChangeById(id);
  if (!existing) {
    throw notFoundError("Change nicht gefunden");
  }
  if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
    throw new AppError(409, "CONFLICT", "Nur DRAFT- oder SCHEDULED-Changes koennen bearbeitet werden");
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const { serviceIds, title, description, changeType, category, risk, riskAssessment, rollbackPlan, ownerId, plannedStartAt, plannedEndAt, emergencyJustification, deploymentId } = parsed.data;

  if (serviceIds !== undefined && serviceIds.length > 0) {
    const services = await getServicesByIds(serviceIds);
    if (services.length !== serviceIds.length || services.some((s) => s.organizationId !== existing.organizationId)) {
      res.status(404).json({ error: "Mindestens ein Service wurde nicht gefunden" });
      return;
    }
  }
  if (deploymentId) {
    const effectiveServiceIds = serviceIds ?? (await listServiceIdsForChange(id));
    await validateDeploymentLink(deploymentId, effectiveServiceIds);
  }

  const updated = await updateChange(id, {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(changeType !== undefined ? { changeType } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(risk !== undefined ? { risk } : {}),
    ...(riskAssessment !== undefined ? { riskAssessment } : {}),
    ...(rollbackPlan !== undefined ? { rollbackPlan } : {}),
    ...(ownerId !== undefined ? { ownerId } : {}),
    ...(plannedStartAt !== undefined ? { plannedStartAt: plannedStartAt ? plannedStartAt.toISOString() : null } : {}),
    ...(plannedEndAt !== undefined ? { plannedEndAt: plannedEndAt ? plannedEndAt.toISOString() : null } : {}),
    ...(emergencyJustification !== undefined ? { emergencyJustification } : {}),
    ...(deploymentId !== undefined ? { deploymentId } : {}),
  });
  if (!updated) {
    throw notFoundError("Change nicht gefunden");
  }
  if (serviceIds !== undefined) {
    await replaceChangeServices(id, serviceIds);
  }

  broadcast(createEvent(RealtimeEventType.CHANGE_UPDATED, updated));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CHANGE_UPDATED",
    category: "CHANGE",
    message: `Change "${updated.title}" aktualisiert`,
    metadata: { changeId: id, organizationId: updated.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json({ ...updated, serviceIds: serviceIds ?? (await listServiceIdsForChange(id)) });
});

changesRouter.delete("/changes/:id", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const existing = await getChangeById(id);
  if (!existing) {
    throw notFoundError("Change nicht gefunden");
  }
  if (existing.status !== "DRAFT") {
    throw new AppError(409, "CONFLICT", "Nur DRAFT-Changes koennen geloescht werden - bereits geplante/laufende Changes muessen abgebrochen werden");
  }
  await deleteChange(id);
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CHANGE_DELETED",
    category: "CHANGE",
    message: `Change "${existing.title}" geloescht`,
    metadata: { changeId: id, organizationId: existing.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

changesRouter.post("/changes/:id/schedule", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const existing = await getChangeById(id);
  if (!existing) throw notFoundError("Change nicht gefunden");
  if (!existing.plannedStartAt || !existing.plannedEndAt) {
    throw new AppError(400, "VALIDATION_ERROR", "plannedStartAt und plannedEndAt muessen vor dem Planen gesetzt sein");
  }
  const updated = await scheduleChange(id);
  if (!updated) {
    throw new AppError(409, "CONFLICT", "Change kann aus dem aktuellen Status nicht geplant werden (nur aus DRAFT)");
  }
  broadcast(createEvent(RealtimeEventType.CHANGE_UPDATED, updated));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CHANGE_SCHEDULED",
    category: "CHANGE",
    message: `Change "${updated.title}" eingeplant`,
    metadata: { changeId: id, organizationId: updated.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

changesRouter.post("/changes/:id/start", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }

  // Phase 29 "Enterprise Change Intelligence, Risk Correlation & Deployment
  // Safety" Auftragspunkt 3 "Pre-Deployment Safety Check" - nur ausgewertet,
  // wenn ueberhaupt ein legitimer Startversuch vorliegt (sonst liefert
  // startChange() unten ohnehin 409, ohne dass die vergleichsweise teure
  // Risikoanalyse noetig waere). EMERGENCY-Changes duerfen einen BLOCKED-
  // Befund umgehen (siehe core/change-risk.ts#isSafetyBlockOverridable),
  // exakt dasselbe Prinzip wie der bestehende Freigabe-Bypass unten.
  const existingForSafetyCheck = await getChangeById(id);
  if (existingForSafetyCheck && (existingForSafetyCheck.status === "DRAFT" || existingForSafetyCheck.status === "SCHEDULED") && !isSafetyBlockOverridable(existingForSafetyCheck)) {
    const serviceIdsForSafetyCheck = await listServiceIdsForChange(id);
    const riskAnalysis = await analyzeChangeRisk({ ...existingForSafetyCheck, serviceIds: serviceIdsForSafetyCheck });
    if (riskAnalysis.verdict === "BLOCKED") {
      void recordAuditLog({
        ...(req.userId ? { userId: req.userId } : {}),
        action: "CHANGE_START_BLOCKED",
        category: "CHANGE",
        severity: "WARNING",
        message: `Start von Change "${existingForSafetyCheck.title}" durch Safety Check verhindert: ${riskAnalysis.blockers.map((b) => b.label).join("; ")}`,
        metadata: { changeId: id, organizationId: existingForSafetyCheck.organizationId, blockers: riskAnalysis.blockers.map((b) => b.key), score: riskAnalysis.score },
        ...(req.ip ? { ipAddress: req.ip } : {}),
      });
      throw new AppError(
        403,
        "FORBIDDEN",
        `Dieser Change kann derzeit nicht gestartet werden: ${riskAnalysis.blockers.map((b) => b.label).join("; ")}`,
        { blockers: riskAnalysis.blockers },
      );
    }
  }

  const result = await startChange(id);
  if (result === undefined) {
    throw new AppError(409, "CONFLICT", "Change kann aus dem aktuellen Status nicht gestartet werden (nur aus DRAFT/SCHEDULED)");
  }
  if (result === "APPROVAL_REQUIRED") {
    // Kein eigener ErrorCode - siehe core/app-error.ts Kommentar
    // ("Bewusst kein neuer Code fuer APPROVAL_REQUIRED", Phase 18
    // Automation-Approval): FORBIDDEN passt semantisch fuer "gueltiger
    // Request, aber die Vorbedingung fehlt noch".
    throw new AppError(403, "FORBIDDEN", "Dieser Change erfordert eine Freigabe (Risiko HIGH/CRITICAL), bevor er gestartet werden kann");
  }
  broadcast(createEvent(RealtimeEventType.CHANGE_STARTED, result));
  // Fire-and-forget - siehe core/change-lifecycle.ts: ein Fehler beim
  // automatischen Wartungsfenster darf den bereits erfolgreich gestarteten
  // Change niemals rueckgaengig machen oder den Request blockieren.
  void createMaintenanceWindowsForChangeStart(result, req.userId);
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CHANGE_STARTED",
    category: "CHANGE",
    message: `Change "${result.title}" gestartet`,
    metadata: { changeId: id, organizationId: result.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(result);
});

changesRouter.post("/changes/:id/complete", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const updated = await completeChange(id);
  if (!updated) {
    throw new AppError(409, "CONFLICT", "Change kann aus dem aktuellen Status nicht abgeschlossen werden (nur aus IN_PROGRESS)");
  }
  broadcast(createEvent(RealtimeEventType.CHANGE_COMPLETED, updated));
  void endMaintenanceWindowsForChange(id);
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CHANGE_COMPLETED",
    category: "CHANGE",
    message: `Change "${updated.title}" abgeschlossen`,
    metadata: { changeId: id, organizationId: updated.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

const failSchema = z.object({ reason: z.string().trim().max(2000).optional() }).strict();

// Auftragspunkt 2 "Change-Lifecycle" - "War die Aenderung erfolgreich?":
// ein eigener Endzustand, getrennt von CANCELLED (vor der Ausfuehrung
// abgebrochen) und COMPLETED (erfolgreich). Dasselbe Muster wie
// /complete: CAS-Uebergang aus IN_PROGRESS, beendet ein ggf. automatisch
// erzeugtes Wartungsfenster (ein gescheiterter Change ist kein geplanter
// Zustand mehr, echte Ausfaelle sollen ab jetzt wieder normal als
// Incident erkannt werden).
changesRouter.post("/changes/:id/fail", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const parsed = failSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const updated = await failChange(id, parsed.data.reason);
  if (!updated) {
    throw new AppError(409, "CONFLICT", "Change kann aus dem aktuellen Status nicht als fehlgeschlagen markiert werden (nur aus IN_PROGRESS)");
  }
  broadcast(createEvent(RealtimeEventType.CHANGE_FAILED, updated));
  void endMaintenanceWindowsForChange(id);
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CHANGE_FAILED",
    category: "CHANGE",
    message: `Change "${updated.title}" fehlgeschlagen${parsed.data.reason ? `: ${parsed.data.reason}` : ""}`,
    metadata: { changeId: id, organizationId: updated.organizationId, reason: parsed.data.reason ?? null },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

const cancelSchema = z.object({ reason: z.string().trim().max(2000).optional() }).strict();

changesRouter.post("/changes/:id/cancel", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const parsed = cancelSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const updated = await cancelChange(id);
  if (!updated) {
    throw new AppError(409, "CONFLICT", "Change kann aus dem aktuellen Status nicht abgebrochen werden (bereits COMPLETED/CANCELLED)");
  }
  broadcast(createEvent(RealtimeEventType.CHANGE_CANCELLED, updated));
  void endMaintenanceWindowsForChange(id);
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CHANGE_CANCELLED",
    category: "CHANGE",
    message: `Change "${updated.title}" abgebrochen${parsed.data.reason ? `: ${parsed.data.reason}` : ""}`,
    metadata: { changeId: id, organizationId: updated.organizationId, reason: parsed.data.reason ?? null },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

changesRouter.post("/changes/:id/approve", authenticate, authorizePlatformOrOrganizationRole(APPROVE_ROLES, resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const updated = await approveChange(id, req.userId);
  if (!updated) {
    throw new AppError(409, "CONFLICT", "Change ist nicht (mehr) PENDING - Freigabe nicht moeglich");
  }
  broadcast(createEvent(RealtimeEventType.CHANGE_APPROVED, updated));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CHANGE_APPROVED",
    category: "CHANGE",
    message: `Change "${updated.title}" freigegeben`,
    metadata: { changeId: id, organizationId: updated.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

const rejectSchema = z.object({ reason: z.string().trim().min(1).max(2000) }).strict();

changesRouter.post("/changes/:id/reject", authenticate, authorizePlatformOrOrganizationRole(APPROVE_ROLES, resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const updated = await rejectChange(id, req.userId, parsed.data.reason);
  if (!updated) {
    throw new AppError(409, "CONFLICT", "Change ist nicht (mehr) PENDING - Ablehnung nicht moeglich");
  }
  broadcast(createEvent(RealtimeEventType.CHANGE_REJECTED, updated));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CHANGE_REJECTED",
    category: "CHANGE",
    message: `Change "${updated.title}" abgelehnt: ${parsed.data.reason}`,
    metadata: { changeId: id, organizationId: updated.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

// ---------------------------------------------------------------------------
// Service-Zuordnung / Impact / Verknuepfungen
// ---------------------------------------------------------------------------

const servicesSchema = z.object({ serviceIds: z.array(z.number().int().positive()).max(MAX_SERVICES_PER_CHANGE) }).strict();

changesRouter.put("/changes/:id/services", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const existing = await getChangeById(id);
  if (!existing) throw notFoundError("Change nicht gefunden");
  const parsed = servicesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.serviceIds.length > 0) {
    const services = await getServicesByIds(parsed.data.serviceIds);
    if (services.length !== parsed.data.serviceIds.length || services.some((s) => s.organizationId !== existing.organizationId)) {
      res.status(404).json({ error: "Mindestens ein Service wurde nicht gefunden" });
      return;
    }
  }
  const serviceIds = await replaceChangeServices(id, parsed.data.serviceIds);
  res.json({ changeId: id, serviceIds });
});

// Auftragspunkt 6 "Impact Analysis" - wiederverwendet unveraendert die
// Phase-25-Engine (core/topology.ts#getFullImpactAnalysis), einmal je
// zugeordnetem Service (ein Change kann mehrere Services betreffen).
changesRouter.get("/changes/:id/impact", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const existing = await getChangeById(id);
  if (!existing) throw notFoundError("Change nicht gefunden");
  const serviceIds = await listServiceIdsForChange(id);
  if (serviceIds.length === 0) {
    res.json({ services: [] });
    return;
  }
  const services = await getServicesByIds(serviceIds);
  const analyses = await Promise.all(
    services.map(async (service) => {
      const impact = await getFullImpactAnalysis(service);
      // Phase 57 "Enterprise Operational Dependency & Blast Radius Assurance" -
      // bislang rein strukturell (nur Service-Stammdaten + Tiefe). Reichert
      // jeden betroffenen Service jetzt zusaetzlich mit dessen AKTUELLEM
      // Health-/SLO-Zustand an, additiv unter `affectedServicesEnriched` -
      // die bestehende `impact.affectedServices` bleibt unveraendert
      // (Rueckwaertskompatibilitaet fuer bestehende Konsumenten).
      const affectedServicesEnriched = await enrichAffectedServicesWithStatus(impact.affectedServices);
      return { service, impact, affectedServicesEnriched };
    }),
  );
  res.json({ services: analyses });
});

// Phase 29 "Enterprise Change Intelligence, Risk Correlation & Deployment
// Safety" Auftragspunkt 9 "Interne API fuer Risk/Safety" - reiner
// Lesezugriff, dieselbe Autorisierung wie /impact. Auftragspunkt 11: keine
// kuenstliche Persistierung - jeder Aufruf berechnet frisch (ueber den
// bestehenden 15s-Impact-Cache in core/topology.ts stabilisiert).
changesRouter.get("/changes/:id/risk", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const existing = await getChangeById(id);
  if (!existing) throw notFoundError("Change nicht gefunden");
  const serviceIds = await listServiceIdsForChange(id);
  const analysis = await analyzeChangeRisk({ ...existing, serviceIds });
  res.json(analysis);
});

// Auftragspunkt 5 "Incident Integration" - "Change/Incident gegenseitig
// verlinken": abgeleitete Korrelation ueber die bereits zugeordneten
// Services/Projekte statt einer gespeicherten FK-Beziehung, analog zu GET
// /incidents/:id/recent-deployments (Phase 27) - vermeidet die Frage "wann
// genau wird die FK gesetzt" bei einem Vorgang, der ohnehin schon ueber
// Service->Projekt aufloesbar ist.
changesRouter.get("/changes/:id/related-incidents", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const existing = await getChangeById(id);
  if (!existing) throw notFoundError("Change nicht gefunden");
  const serviceIds = await listServiceIdsForChange(id);
  const services = await getServicesByIds(serviceIds);
  const projectIds = [...new Set(services.map((s) => s.projectId).filter((p): p is string => p !== null))];
  if (projectIds.length === 0) {
    res.json([]);
    return;
  }
  const incidents = await getIncidents({ projectIds, limit: 100 });
  res.json(incidents);
});

// Auftragspunkt 8 "Change Timeline" - "in der bestehenden Timeline/Audit-
// Infrastruktur nachvollziehbar": KEINE neue change_timeline-Tabelle,
// stattdessen der bereits bestehende audit_log gefiltert nach
// metadata.changeId (jede Lifecycle-Aktion oben schreibt bereits
// changeId in die Audit-Metadaten). Bewusst NICHT ueber GET /audit-log
// (das verlangt authorizeGlobalAdmin() - project OWNER/ADMIN, siehe
// routes/audit.routes.ts), sondern hier unter derselben
// authorizePlatformOrOrganizationMembership()-Regel wie jeder andere
// Change-Endpunkt: ein regulaeres Organisationsmitglied, das den Change
// selbst sehen darf, muss auch dessen Audit-Trail sehen koennen.
changesRouter.get("/changes/:id/audit", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const existing = await getChangeById(id);
  if (!existing) throw notFoundError("Change nicht gefunden");
  res.json(await listAuditLog({ changeId: id, limit: 100 }));
});

changesRouter.get("/changes/:id/maintenance-windows", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForChange), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Change-ID" });
    return;
  }
  const existing = await getChangeById(id);
  if (!existing) throw notFoundError("Change nicht gefunden");
  res.json(await listMaintenanceWindows({ changeId: id }));
});

async function resolveOrgIdForServiceParam(req: Request): Promise<string | null> {
  const id = Number(req.params.serviceId);
  if (!Number.isInteger(id)) return null;
  return (await getServiceOrganizationId(id)) ?? null;
}

// Fuer die Service-Detailseite (Auftragspunkt 13 "aktuelle/geplante
// Changes anzeigen") - "kein zweiter Filterpfad", derselbe listChanges()
// mit serviceId-Filter, den auch GET /changes anbietet, nur unter dem
// Service-Pfad gespiegelt fuer bequemeren Frontend-Zugriff ohne
// organizationId manuell mitgeben zu muessen.
changesRouter.get(
  "/services/:serviceId/changes",
  authenticate,
  authorizePlatformOrOrganizationMembership(resolveOrgIdForServiceParam),
  async (req, res) => {
    const serviceId = Number(req.params.serviceId);
    if (!Number.isInteger(serviceId)) {
      res.status(400).json({ error: "Ungueltige Service-ID" });
      return;
    }
    const changes = await listChangesForServiceIds([serviceId]);
    res.json(changes);
  },
);
