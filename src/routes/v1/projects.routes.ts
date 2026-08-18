import { Router } from "express";
import { getAllProjectsHealth, getProjectHealth } from "../../db/dashboard.repository";
import { getProjectOrganizationId } from "../../db/projects.repository";
import { listProjectIdsForTeam } from "../../db/teams.repository";
import { authenticateApiKey, apiKeyRateLimiter, enforceApiQuota, requireApiScope, trackApiUsage } from "../../middleware/api-key-auth";
import { notFoundError } from "../../core/app-error";
import { paginatedResponse, parsePagination, toProjectDto } from "./shared";

// Phase 16 Auftragspunkt 3 "Echte externe API" - liest ausschliesslich aus
// dem bestehenden dashboard.repository.ts (Auftragspunkt 3: "Keine
// Duplizierung der SQL-Logik"), serialisiert aber ueber eigene DTOs
// (shared.ts) statt interne Typen direkt zurueckzugeben. Middleware-
// Reihenfolge entspricht dem Auftragsdiagramm: Authentication ->
// Organization/Team Context -> Authorization (Scope) -> Rate Limit ->
// Quota -> Usage Recording.
export const v1ProjectsRouter = Router();

async function resolveOrgAndTeamScopedProjects(organizationId: string, teamId: string | null) {
  let projects = await getAllProjectsHealth(organizationId);
  // Auftragspunkt 1 "Team-Kontext beruecksichtigen" - ein team-gebundener
  // Key sieht nur die Projekte, die dem Team zugeordnet sind (project_teams,
  // Phase 15). Die Organisationsgrenze oben ist bereits die harte
  // SQL-Grenze; dies ist eine zusaetzliche Einschraenkung INNERHALB der
  // eigenen Organisation, kein Sicherheits-Bypass-Risiko bei einem Fehler
  // hier.
  if (teamId) {
    const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
    projects = projects.filter((project) => teamProjectIds.has(project.id));
  }
  return projects;
}

v1ProjectsRouter.get(
  "/v1/projects",
  authenticateApiKey,
  requireApiScope("projects:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const projects = await resolveOrgAndTeamScopedProjects(context.organizationId, context.teamId);
    const pagination = parsePagination(req);
    const page = projects.slice(pagination.offset, pagination.offset + pagination.pageSize).map(toProjectDto);
    res.json(paginatedResponse(page, pagination, projects.length));
  },
);

async function assertProjectAccessible(projectId: string, organizationId: string, teamId: string | null): Promise<void> {
  // Auftragspunkt 4 "Tenant Isolation"/Auftragspunkt 10 "Security" - 404
  // (nicht 403) fuer Projekte fremder Organisationen, damit ein API-Key
  // nicht einmal die EXISTENZ einer fremden Projekt-id bestaetigt bekommt
  // (kein IDOR/Enumeration).
  const projectOrgId = await getProjectOrganizationId(projectId);
  if (!projectOrgId || projectOrgId !== organizationId) {
    throw notFoundError("Projekt nicht gefunden");
  }
  if (teamId) {
    const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
    if (!teamProjectIds.has(projectId)) {
      throw notFoundError("Projekt nicht gefunden");
    }
  }
}

v1ProjectsRouter.get(
  "/v1/projects/:id",
  authenticateApiKey,
  requireApiScope("projects:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const projectId = req.params.id as string;
    await assertProjectAccessible(projectId, context.organizationId, context.teamId);

    const project = await getProjectHealth(projectId);
    if (!project) {
      throw notFoundError("Projekt nicht gefunden");
    }
    res.json({ data: toProjectDto(project) });
  },
);

// GET /api/v1/projects/:id/health - eigener, engerer Endpunkt (nur der
// Health-Teilbereich) fuer Konsumenten, die ausschliesslich den
// Gesundheitsstatus brauchen, ohne den vollen Projekt-DTO zu parsen.
v1ProjectsRouter.get(
  "/v1/projects/:id/health",
  authenticateApiKey,
  requireApiScope("projects:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const projectId = req.params.id as string;
    await assertProjectAccessible(projectId, context.organizationId, context.teamId);

    const project = await getProjectHealth(projectId);
    if (!project) {
      throw notFoundError("Projekt nicht gefunden");
    }
    const dto = toProjectDto(project);
    res.json({ data: { id: dto.id, health: dto.health, checks: dto.checks, openIncidents: dto.openIncidents } });
  },
);
