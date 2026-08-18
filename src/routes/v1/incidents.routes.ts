import { Router } from "express";
import { z } from "zod";
import {
  acknowledgeIncident,
  countIncidents,
  getIncidentById,
  getIncidents,
  reopenIncident,
  resolveIncidentById,
} from "../../db/incidents.repository";
import { addTimelineEvent } from "../../db/incident-timeline.repository";
import { getProjectIdsForOrganization, getProjectOrganizationId } from "../../db/projects.repository";
import { listProjectIdsForTeam } from "../../db/teams.repository";
import {
  authenticateApiKey,
  apiKeyRateLimiter,
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  requireApiScope,
  trackApiUsage,
} from "../../middleware/api-key-auth";
import { paginatedResponse, parsePagination, toIncidentDto, toPostmortemDto, toEscalationStatusDto, toIncidentCommunicationDto } from "./shared";
import { listCommunicationsForIncident } from "../../db/incident-communications.repository";
import { getEscalationPolicyById, listEscalationSteps } from "../../db/escalation-policies.repository";
import { resolveStepTarget } from "../../core/incident-escalation";
import { AppError, notFoundError } from "../../core/app-error";
import { recordAuditLog } from "../../core/audit-log";
import { broadcast } from "../../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../../realtime/events";
import { evaluateAutomationTriggers } from "../../automation/automation-engine";
import { getPostmortemByIncidentId, listActionItems } from "../../db/postmortems.repository";
import { broadcastEscalationResolvedIfNeeded } from "../../core/incident-escalation";

// Phase 16 Auftragspunkt 3 "Echte externe API" - liest ausschliesslich aus
// dem bestehenden incidents.repository.ts (um projectIds/offset erweitert,
// siehe dort), keine eigene SQL-Logik. DTO-Serialisierung ueber shared.ts.
export const v1IncidentsRouter = Router();

const querySchema = z.object({
  resolved: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

async function resolveOrgAndTeamProjectIds(organizationId: string, teamId: string | null): Promise<string[]> {
  let projectIds = await getProjectIdsForOrganization(organizationId);
  if (teamId) {
    const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
    projectIds = projectIds.filter((id) => teamProjectIds.has(id));
  }
  return projectIds;
}

v1IncidentsRouter.get(
  "/v1/incidents",
  authenticateApiKey,
  requireApiScope("incidents:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Filter", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }

    // Auftragspunkt 4 "Tenant Isolation" - die Projekt-ids der eigenen
    // Organisation (bzw. bei Team-Kontext: der Schnittmenge mit den
    // Team-Projekten) werden direkt in die SQL-Abfrage gereicht
    // (getIncidents({ projectIds })), nicht erst nachtraeglich gefiltert -
    // vermeidet faelschlich leere Ergebnisse bei vielen fremden Incidents
    // vor dem LIMIT.
    const projectIds = await resolveOrgAndTeamProjectIds(context.organizationId, context.teamId);
    const pagination = parsePagination(req);

    if (projectIds.length === 0) {
      res.json(paginatedResponse([], pagination, 0));
      return;
    }

    const filter = { ...(parsed.data.resolved !== undefined ? { resolved: parsed.data.resolved } : {}), projectIds };
    const [incidents, total] = await Promise.all([
      getIncidents({ ...filter, limit: pagination.pageSize, offset: pagination.offset }),
      countIncidents(filter),
    ]);
    res.json(paginatedResponse(incidents.map(toIncidentDto), pagination, total));
  },
);

// Phase 21 Auftragspunkt 11/14 "Incident API" - Tenant Isolation (Auftragspunkt
// 16) wie bei jedem anderen /api/v1-Endpunkt: 404 (nie 403) fuer einen
// Incident aus einem fremden Projekt/einer fremden Organisation/einem
// fremden Team, damit ein Aufrufer nicht zwischen "existiert nicht" und
// "gehoert dir nicht" unterscheiden kann.
async function assertIncidentVisible(incidentId: number, organizationId: string, teamId: string | null) {
  const incident = await getIncidentById(incidentId);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  const incidentOrgId = await getProjectOrganizationId(incident.projectId);
  if (!incidentOrgId || incidentOrgId !== organizationId) {
    throw notFoundError("Incident nicht gefunden");
  }
  if (teamId) {
    const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
    if (!teamProjectIds.has(incident.projectId)) {
      throw notFoundError("Incident nicht gefunden");
    }
  }
  return incident;
}

v1IncidentsRouter.get(
  "/v1/incidents/:id",
  authenticateApiKey,
  requireApiScope("incidents:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Incident-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const incident = await assertIncidentVisible(id, context.organizationId, context.teamId);
    res.json({ data: toIncidentDto(incident) });
  },
);

// Phase 26 Auftragspunkt 6 "Externe API, falls sinnvoll" - bewusst nur
// lesend (Postmortems werden intern von Menschen kollaborativ erstellt/
// bearbeitet, kein Anwendungsfall fuer externen Schreibzugriff). Nutzt
// denselben incidents:read-Scope wie GET /v1/incidents/:id, da ein
// Postmortem inhaltlich zum Incident gehoert - kein eigener Scope noetig
// (Auftragspunkt "keine zweite Infrastruktur, wenn bereits eine passende
// vorhanden ist").
v1IncidentsRouter.get(
  "/v1/incidents/:id/postmortem",
  authenticateApiKey,
  requireApiScope("incidents:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Incident-ID", code: "VALIDATION_ERROR" });
      return;
    }
    await assertIncidentVisible(id, context.organizationId, context.teamId);

    const postmortem = await getPostmortemByIncidentId(id);
    if (!postmortem) {
      throw notFoundError("Fuer diesen Incident existiert noch kein Postmortem");
    }
    const actionItems = await listActionItems(postmortem.id);
    res.json({ data: toPostmortemDto({ ...postmortem, actionItems }) });
  },
);

// Phase 27 "Enterprise On-Call & Escalation Management" - dasselbe Prinzip
// wie der Postmortem-Endpunkt direkt darueber: nur lesend, denselben
// incidents:read-Scope wiederverwendet (kein eigener Scope noetig, Auftrag
// "bestehende Scopes wiederverwenden, wenn moeglich"). Der primaere reale
// Anwendungsfall ist ein ChatOps-Bot/Status-Dashboard, das fragt "wer muss
// gerade fuer diesen Incident benachrichtigt werden".
v1IncidentsRouter.get(
  "/v1/incidents/:id/escalation",
  authenticateApiKey,
  requireApiScope("incidents:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Incident-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const incident = await assertIncidentVisible(id, context.organizationId, context.teamId);

    if (incident.escalationPolicyId === null) {
      res.json({ data: toEscalationStatusDto({ policy: null, currentStepOrder: 0, currentTarget: null, nextStep: null }) });
      return;
    }

    const policy = await getEscalationPolicyById(incident.escalationPolicyId);
    const steps = await listEscalationSteps(incident.escalationPolicyId);
    const currentStep = steps.find((s) => s.stepOrder === incident.lastEscalatedStep);
    const target = currentStep ? await resolveStepTarget(currentStep) : null;
    const upcoming = steps.filter((s) => s.stepOrder > incident.lastEscalatedStep).sort((a, b) => a.stepOrder - b.stepOrder)[0];
    const nextStep =
      upcoming && !incident.resolved && incident.acknowledgedAt === null
        ? {
            stepOrder: upcoming.stepOrder,
            delayMinutes: upcoming.delayMinutes,
            dueAt: new Date(new Date(incident.createdAt).getTime() + upcoming.delayMinutes * 60_000).toISOString(),
          }
        : null;

    res.json({
      data: toEscalationStatusDto({
        policy: policy ? { ...policy, steps } : null,
        currentStepOrder: incident.lastEscalatedStep,
        currentTarget: currentStep
          ? { stepOrder: currentStep.stepOrder, delayMinutes: currentStep.delayMinutes, targetType: currentStep.targetType, userId: target?.userId ?? null, userName: target?.userName ?? null }
          : null,
        nextStep,
      }),
    });
  },
);

// Phase 31 "Enterprise Change/Incident Communication & Stakeholder
// Notification Intelligence" Auftragspunkt 16 "Externe API" - bewusst NUR
// lesend (kein POST): Stakeholder-Kommunikation ist ein von Menschen
// bewusst ausgeloester Vorgang mit eigenem Safety-Gate (Cooldown/Dedup/
// Berechtigung), kein Anwendungsfall fuer unbeaufsichtigten externen
// Schreibzugriff. Denselben incidents:read-Scope wiederverwendet, dasselbe
// Muster wie /postmortem und /escalation direkt darueber.
v1IncidentsRouter.get(
  "/v1/incidents/:id/communications",
  authenticateApiKey,
  requireApiScope("incidents:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Incident-ID", code: "VALIDATION_ERROR" });
      return;
    }
    await assertIncidentVisible(id, context.organizationId, context.teamId);

    const communications = await listCommunicationsForIncident(id);
    res.json({ data: communications.map(toIncidentCommunicationDto) });
  },
);

v1IncidentsRouter.post(
  "/v1/incidents/:id/acknowledge",
  authenticateApiKey,
  requireApiScope("incidents:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Incident-ID", code: "VALIDATION_ERROR" });
      return;
    }
    await assertIncidentVisible(id, context.organizationId, context.teamId);

    const acknowledged = await acknowledgeIncident(id);
    const current = acknowledged ?? (await getIncidentById(id))!;
    if (acknowledged) {
      broadcast(createEvent(RealtimeEventType.INCIDENT_ACKNOWLEDGED, acknowledged));
      void addTimelineEvent({
        incidentId: id,
        eventType: "ACKNOWLEDGED",
        message: "Bestaetigt ueber die externe API",
        metadata: { actorApiKeyId: context.apiKeyId },
      });
      void recordAuditLog({
        action: "API_INCIDENT_ACKNOWLEDGED",
        category: "INCIDENT",
        projectId: acknowledged.projectId,
        message: `Incident #${acknowledged.id} ueber die externe API bestaetigt`,
        metadata: { incidentId: acknowledged.id, organizationId: context.organizationId, actorApiKeyId: context.apiKeyId },
        ...(req.ip ? { ipAddress: req.ip } : {}),
      });
    }
    res.json({ data: toIncidentDto(current) });
  },
);

const resolveSchema = z.object({ reason: z.string().trim().min(1).max(2000).optional() }).strict();

v1IncidentsRouter.post(
  "/v1/incidents/:id/resolve",
  authenticateApiKey,
  requireApiScope("incidents:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Incident-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const parsed = resolveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }
    await assertIncidentVisible(id, context.organizationId, context.teamId);

    const resolved = await resolveIncidentById(id, parsed.data.reason);
    if (!resolved) {
      throw new AppError(409, "CONFLICT", "Incident bereits geloest");
    }
    broadcast(createEvent(RealtimeEventType.INCIDENT_RESOLVED, resolved));
    broadcastEscalationResolvedIfNeeded(resolved);
    void addTimelineEvent({
      incidentId: id,
      eventType: "RESOLVED",
      message: "Ueber die externe API geloest",
      metadata: { actorApiKeyId: context.apiKeyId, reason: parsed.data.reason ?? null },
    });
    void recordAuditLog({
      action: "API_INCIDENT_RESOLVED",
      category: "INCIDENT",
      projectId: resolved.projectId,
      message: `Incident #${resolved.id} ueber die externe API geloest`,
      metadata: { incidentId: resolved.id, organizationId: context.organizationId, actorApiKeyId: context.apiKeyId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    try {
      await evaluateAutomationTriggers("INCIDENT_RESOLVED", resolved.projectId, {
        incidentId: resolved.id,
        checkId: resolved.checkId,
        severity: resolved.severity,
      });
    } catch {
      // Siehe interne Route (routes/incidents.routes.ts) - Automatisierungs-
      // Trigger duerfen das bereits erfolgte Resolve nicht rueckgaengig machen.
    }
    res.json({ data: toIncidentDto(resolved) });
  },
);

v1IncidentsRouter.post(
  "/v1/incidents/:id/reopen",
  authenticateApiKey,
  requireApiScope("incidents:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Incident-ID", code: "VALIDATION_ERROR" });
      return;
    }
    await assertIncidentVisible(id, context.organizationId, context.teamId);

    const result = await reopenIncident(id);
    if (result === "CONFLICT") {
      throw new AppError(409, "CONFLICT", "Fuer diesen Check ist bereits ein neuer Incident offen - Reopen nicht moeglich");
    }
    if (!result) {
      throw new AppError(409, "CONFLICT", "Incident nicht geloest");
    }
    broadcast(createEvent(RealtimeEventType.INCIDENT_REOPENED, result));
    void addTimelineEvent({
      incidentId: id,
      eventType: "REOPENED",
      message: "Ueber die externe API wieder geoeffnet",
      metadata: { actorApiKeyId: context.apiKeyId },
    });
    void recordAuditLog({
      action: "API_INCIDENT_REOPENED",
      category: "INCIDENT",
      severity: "WARNING",
      projectId: result.projectId,
      message: `Incident #${result.id} ueber die externe API wieder geoeffnet`,
      metadata: { incidentId: result.id, organizationId: context.organizationId, actorApiKeyId: context.apiKeyId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.json({ data: toIncidentDto(result) });
  },
);
