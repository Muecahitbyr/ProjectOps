import { Router } from "express";
import { z } from "zod";
import { getServiceById, listServices } from "../../db/services.repository";
import { listDependenciesForService } from "../../db/service-dependencies.repository";
import { listProjectIdsForTeam } from "../../db/teams.repository";
import { buildTopologyGraph, getFullImpactAnalysis } from "../../core/topology";
import { buildServicePortfolio } from "../../core/service-portfolio";
import { RESILIENCE_RANGE_HOURS, RESILIENCE_RANGE_VALUES } from "../../types/resilience.types";
import {
  authenticateApiKey,
  apiKeyRateLimiter,
  enforceApiQuota,
  requireApiScope,
  trackApiUsage,
} from "../../middleware/api-key-auth";
import { paginatedResponse, parsePagination, toServicePortfolioSummaryDto } from "./shared";
import { notFoundError } from "../../core/app-error";

// Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
// Intelligence" Auftragspunkt 17 "API" (extern) - bewusst NUR lesend (die
// im Auftrag explizit aufgezaehlten externen Endpunkte sind ausschliesslich
// GET): Schreiboperationen auf dem Service-Katalog bleiben Platform-Ownern
// ueber die interne UI vorbehalten (routes/platform-services.routes.ts).
// services:write (types/api-scope.types.ts) ist ein bewusst RESERVIERTER
// Scope ohne aktuell durchsetzenden Endpunkt - identisches, bereits
// etabliertes Muster wie automation:write in Phase 17 (dort zunaechst ohne
// Endpunkt, in Phase 18 aktiviert) - kein totes Feature, sondern eine
// bewusste, dokumentierte Vorbereitung.
export const v1ServicesRouter = Router();

async function resolveOrgAndTeamServiceFilter(organizationId: string, teamId: string | null) {
  return { organizationId, ...(teamId ? { teamId } : {}) };
}

v1ServicesRouter.get(
  "/v1/services",
  authenticateApiKey,
  requireApiScope("services:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const pagination = parsePagination(req);
    const filter = await resolveOrgAndTeamServiceFilter(context.organizationId, context.teamId);
    const all = await listServices(filter);
    const page = all.slice(pagination.offset, pagination.offset + pagination.pageSize);
    res.json(paginatedResponse(page, pagination, all.length));
  },
);

// Phase 48 "Enterprise Service Portfolio & Strategic Lifecycle Intelligence" -
// MUSS vor /v1/services/:id registriert sein (sonst wuerde "portfolio" als
// :id interpretiert, dieselbe Reihenfolge-Notwendigkeit wie
// routes/platform-services.routes.ts). Kein neuer Scope - services:read
// deckt bereits den gesamten Servicekatalog ab, das Portfolio ist dieselbe
// Ressourcenklasse mit zusaetzlicher, bereits bestehender Intelligence
// angereichert.
const portfolioQuerySchema = z.object({ range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d") });

v1ServicesRouter.get(
  "/v1/services/portfolio",
  authenticateApiKey,
  requireApiScope("services:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const { range } = portfolioQuerySchema.parse(req.query);
    const portfolio = await buildServicePortfolio({ organizationId: context.organizationId, hours: RESILIENCE_RANGE_HOURS[range] });
    // Team-gescopte Keys duerfen nur Services ihres eigenen Teams sehen -
    // dasselbe nachtraegliche Filtern auf Projekt-Ebene wie routes/v1/
    // resilience.routes.ts#filterRowsForTeam (buildServicePortfolio() selbst
    // kennt, wie buildResilienceOverview(), keinen teamId-Filter).
    let entries = portfolio.entries;
    if (context.teamId) {
      const teamProjectIds = new Set(await listProjectIdsForTeam(context.teamId));
      entries = entries.filter((e) => e.projectId !== null && teamProjectIds.has(e.projectId));
    }
    res.json({ data: toServicePortfolioSummaryDto({ ...portfolio, entries }) });
  },
);

async function assertServiceVisible(serviceId: number, organizationId: string, teamId: string | null) {
  const service = await getServiceById(serviceId);
  if (!service || service.organizationId !== organizationId) {
    throw notFoundError("Service nicht gefunden");
  }
  if (teamId && service.teamId !== teamId) {
    throw notFoundError("Service nicht gefunden");
  }
  return service;
}

v1ServicesRouter.get(
  "/v1/services/:id",
  authenticateApiKey,
  requireApiScope("services:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Service-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const service = await assertServiceVisible(id, context.organizationId, context.teamId);
    res.json({ data: service });
  },
);

v1ServicesRouter.get(
  "/v1/services/:id/dependencies",
  authenticateApiKey,
  requireApiScope("services:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Service-ID", code: "VALIDATION_ERROR" });
      return;
    }
    await assertServiceVisible(id, context.organizationId, context.teamId);
    res.json({ data: await listDependenciesForService(id) });
  },
);

// Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis"
// Auftragspunkt "Extern nur dann, wenn ein echter Use Case besteht" - ein
// externes Monitoring-/ChatOps-Tool, das bereits per services:read auf den
// Katalog zugreift, hat einen realen Bedarf an "was waere betroffen, wenn
// dieser Service ausfaellt" (z.B. fuer eine automatisierte Vorab-Warnung vor
// einem geplanten Deployment). Kein neuer Scope - services:read deckt
// bereits Dependencies/Topology ab, Impact ist dieselbe Ressourcenklasse.
v1ServicesRouter.get(
  "/v1/services/:id/impact",
  authenticateApiKey,
  requireApiScope("services:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Service-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const service = await assertServiceVisible(id, context.organizationId, context.teamId);
    res.json({ data: await getFullImpactAnalysis(service) });
  },
);

const topologyQuerySchema = z.object({ teamId: z.string().trim().min(1).optional() });

v1ServicesRouter.get(
  "/v1/topology",
  authenticateApiKey,
  requireApiScope("services:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const parsed = topologyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Filter", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }
    // Team-gebundener Key darf sich nicht ueber ein fremdes teamId hinweg
    // ausweiten - dasselbe Muster wie bei anderen /v1-Ressourcen.
    const teamId = context.teamId ?? parsed.data.teamId;
    if (context.teamId && parsed.data.teamId && parsed.data.teamId !== context.teamId) {
      throw notFoundError("Team nicht gefunden");
    }
    res.json({ data: await buildTopologyGraph(context.organizationId, teamId) });
  },
);
