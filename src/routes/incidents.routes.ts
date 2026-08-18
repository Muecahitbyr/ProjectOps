import { Router } from "express";
import { z } from "zod";
import {
  acknowledgeIncident,
  assignIncident,
  getIncidentById,
  getIncidents,
  reopenIncident,
  resolveIncidentById,
} from "../db/incidents.repository";
import { addTimelineEvent, getIncidentTimeline } from "../db/incident-timeline.repository";
import { getUserById } from "../db/users.repository";
import {
  createActionItemIfUnderLimit,
  createPostmortemIfNotExists,
  deleteActionItem,
  getActionItemById,
  getPostmortemByIncidentId,
  listActionItems,
  listActionItemsForPostmortems,
  listPostmortems,
  updateActionItem,
  updatePostmortem,
} from "../db/postmortems.repository";
import { authenticate } from "../middleware/authenticate";
import { notFoundError, AppError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { evaluateAutomationTriggers } from "../automation/automation-engine";
import { getRecentDeploymentsForProject } from "../db/deployments.repository";
import { broadcastEscalationResolvedIfNeeded, getIncidentEscalationSummary } from "../core/incident-escalation";
import { resolveDeploymentCorrelationWindowMinutes } from "./deployments.routes";
import { listMaintenanceWindows } from "../db/maintenance.repository";
import { getServiceByProjectId } from "../db/services.repository";
import { getFullImpactAnalysis } from "../core/topology";
import { enrichAffectedServicesWithStatus } from "../core/service-resilience";
import { getRecentChangesForService, listChangesForServiceIds } from "../db/changes.repository";
import { listDependenciesForService } from "../db/service-dependencies.repository";
import type { Change } from "../types/change.types";
import { resolveChangeCorrelationWindowMinutes } from "./changes.routes";
import { getAutomationRuleById } from "../db/automation-rules.repository";
import { findOrCreateManualRecoveryAction, updateAutomationActionStatus } from "../db/automation.repository";
import { evaluateRecoverySafety, listRecoveryActionsForIncident } from "../core/recovery-safety";
import { runAutomationExecution } from "../automation/execution-runner";
import { hasAutomationExecutor } from "../automation/safe-action-runner";
import { MAX_ACTION_ITEMS_PER_POSTMORTEM, POSTMORTEM_STATUSES, ACTION_ITEM_STATUSES } from "../types/postmortem.types";
import type { PostmortemStatus, PostmortemWithActionItems } from "../types/postmortem.types";
import type { IncidentTimelineEvent } from "../types/incident.types";
import {
  createIncidentCommunication,
  listCommunicationsForIncident,
} from "../db/incident-communications.repository";
import { evaluateCommunicationSafety, buildCommunicationRecommendations } from "../core/incident-communication";
import { getOnCallScheduleOrganizationId } from "../db/on-call.repository";
import { COMMUNICATION_SEVERITIES, NOTIFICATION_CHANNEL_IDS } from "../types/incident-communication.types";
import type { CommunicationSeverity, CommunicationTargetType, NotificationChannelId } from "../types/incident-communication.types";
import { getCommandState, buildCommandOverview } from "../core/incident-command";
import { upsertCommandRole, deleteCommandRole, upsertChecklistItem } from "../db/incident-command.repository";
import { getProjectOrganizationId } from "../db/projects.repository";
import { getOrganizationMembership } from "../db/organizations.repository";
import { INCIDENT_COMMAND_ROLE_TYPES, CHECKLIST_ITEM_KEYS, CHECKLIST_ITEM_STATUSES } from "../types/incident-command.types";
import type { IncidentCommandRoleType, ChecklistItemKey, ChecklistItemStatus } from "../types/incident-command.types";

// Phase 21 "Enterprise Alerting, Incident Response & Notification
// Orchestration" Auftragspunkt 11 "Incident API" - erweitert die bestehende
// (bisher reine Lese-)Route um den vollen Lifecycle (Auftragspunkt 3).
// Bewusst OHNE zusaetzliche Rollenpruefung ueber "authenticate" hinaus -
// GET /incidents hatte seit jeher keine projektbezogene RBAC (jeder
// angemeldete Benutzer sieht alle Incidents, dasselbe gilt fuer /projects,
// /dashboard etc. - dieses interne Tool ist als GEMEINSAME Ops-Konsole
// eines einzelnen Betreiber-Teams konzipiert, Multi-Tenancy gilt gezielt
// fuer die externe API und die Platform-Administration, siehe
// Abschlussbericht "Architekturentscheidungen"). Acknowledge/Resolve/Reopen
// folgen demselben Prinzip: jeder angemeldete Nutzer darf reagieren.
export const incidentsRouter = Router();

incidentsRouter.get("/incidents", authenticate, async (req, res) => {
  const resolvedParam = req.query.resolved;
  const limit = Number(req.query.limit) || 100;
  // Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
  // Intelligence" Auftragspunkt 14 "Service Detail" - optionaler
  // projectId-Filter fuer den "Incidents"-Tab der Service-Detailseite
  // (der Service selbst hat keine eigene Incident-Tabelle, siehe
  // Architekturentscheidung im Abschlussbericht). Additiv: bestehende
  // Aufrufer ohne projectId bleiben unveraendert (weiterhin alle Incidents,
  // die gemeinsame Ops-Konsole ist nicht tenant-/projekt-gefiltert).
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;

  res.json(
    await getIncidents({
      limit,
      ...(resolvedParam === "true" ? { resolved: true } : {}),
      ...(resolvedParam === "false" ? { resolved: false } : {}),
      ...(projectId ? { projectIds: [projectId] } : {}),
    }),
  );
});

function parseIncidentId(req: { params: { id?: string } }): number | undefined {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : undefined;
}

incidentsRouter.get("/incidents/:id", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  res.json(incident);
});

incidentsRouter.get("/incidents/:id/timeline", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  res.json(await getIncidentTimeline(id));
});

incidentsRouter.post("/incidents/:id/acknowledge", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await acknowledgeIncident(id, req.userId!);
  if (!incident) {
    const existing = await getIncidentById(id);
    if (!existing) throw notFoundError("Incident nicht gefunden");
    // Idempotent: bereits bestaetigt oder bereits geloest - kein Fehler,
    // einfach den aktuellen Stand zurueckgeben (siehe Repository-Kommentar).
    res.json(existing);
    return;
  }

  const actor = await getUserById(req.userId!);
  broadcast(createEvent(RealtimeEventType.INCIDENT_ACKNOWLEDGED, incident));
  void addTimelineEvent({
    incidentId: id,
    eventType: "ACKNOWLEDGED",
    message: `Bestaetigt von ${actor?.name ?? "einem Benutzer"}`,
    actorUserId: req.userId!,
  });
  void recordAuditLog({
    userId: req.userId!,
    action: "INCIDENT_ACKNOWLEDGED",
    category: "INCIDENT",
    projectId: incident.projectId,
    message: `Incident #${incident.id} bestaetigt`,
    metadata: { incidentId: incident.id },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(incident);
});

const resolveSchema = z.object({ reason: z.string().trim().min(1).max(2000).optional() }).strict();

incidentsRouter.post("/incidents/:id/resolve", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const parsed = resolveSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const incident = await resolveIncidentById(id, parsed.data.reason);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden oder bereits geloest");
  }

  const actor = await getUserById(req.userId!);
  broadcast(createEvent(RealtimeEventType.INCIDENT_RESOLVED, incident));
  broadcastEscalationResolvedIfNeeded(incident);
  void addTimelineEvent({
    incidentId: id,
    eventType: "RESOLVED",
    message: parsed.data.reason
      ? `Geloest von ${actor?.name ?? "einem Benutzer"}: ${parsed.data.reason}`
      : `Geloest von ${actor?.name ?? "einem Benutzer"}`,
    actorUserId: req.userId!,
  });
  void recordAuditLog({
    userId: req.userId!,
    action: "INCIDENT_RESOLVED",
    category: "INCIDENT",
    projectId: incident.projectId,
    message: `Incident #${incident.id} manuell geloest`,
    metadata: { incidentId: incident.id, reason: parsed.data.reason ?? null },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });

  try {
    await evaluateAutomationTriggers("INCIDENT_RESOLVED", incident.projectId, {
      incidentId: incident.id,
      checkId: incident.checkId,
      severity: incident.severity,
    });
  } catch {
    // Automatisierungs-Trigger duerfen das manuelle Resolve niemals
    // fehlschlagen lassen - der Incident ist zu diesem Zeitpunkt bereits
    // korrekt geloest.
  }

  // Phase 26 Auftragspunkt 7 "Postmortem-Vorschlag" - bei HIGH/CRITICAL
  // Incidents ohne bestehendes Postmortem einen Hinweis-Event feuern
  // (Frontend zeigt einen Banner "Postmortem erstellen?"). Fire-and-forget,
  // darf das Resolve niemals verzoegern oder fehlschlagen lassen.
  if (incident.severity === "HIGH" || incident.severity === "CRITICAL") {
    void getPostmortemByIncidentId(id)
      .then((existing) => {
        if (!existing) {
          broadcast(
            createEvent(RealtimeEventType.INCIDENT_POSTMORTEM_SUGGESTED, {
              incidentId: incident.id,
              incidentTitle: incident.title,
              severity: incident.severity,
            }),
          );
        }
      })
      .catch(() => {
        // Nur ein Hinweis-Event - ein Fehler hier darf den Incident-Resolve
        // niemals beeintraechtigen.
      });
  }

  res.json(incident);
});

incidentsRouter.post("/incidents/:id/reopen", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const result = await reopenIncident(id);
  if (result === "CONFLICT") {
    throw new AppError(409, "CONFLICT", "Fuer diesen Check ist bereits ein neuer Incident offen - Reopen nicht moeglich");
  }
  if (!result) {
    throw notFoundError("Incident nicht gefunden oder nicht geloest");
  }

  const actor = await getUserById(req.userId!);
  broadcast(createEvent(RealtimeEventType.INCIDENT_REOPENED, result));
  void addTimelineEvent({
    incidentId: id,
    eventType: "REOPENED",
    message: `Wieder geoeffnet von ${actor?.name ?? "einem Benutzer"}`,
    actorUserId: req.userId!,
  });
  void recordAuditLog({
    userId: req.userId!,
    action: "INCIDENT_REOPENED",
    category: "INCIDENT",
    severity: "WARNING",
    projectId: result.projectId,
    message: `Incident #${result.id} wieder geoeffnet`,
    metadata: { incidentId: result.id },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(result);
});

const assignSchema = z.object({ assigneeId: z.string().trim().min(1).nullable() }).strict();

incidentsRouter.post("/incidents/:id/assign", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.assigneeId) {
    const assignee = await getUserById(parsed.data.assigneeId);
    if (!assignee) {
      res.status(404).json({ error: "Benutzer nicht gefunden" });
      return;
    }
  }

  const incident = await assignIncident(id, parsed.data.assigneeId);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }

  broadcast(createEvent(RealtimeEventType.INCIDENT_UPDATED, incident));
  void addTimelineEvent({
    incidentId: id,
    eventType: "ASSIGNED",
    message: parsed.data.assigneeId ? `Zugewiesen an Benutzer ${parsed.data.assigneeId}` : "Zuweisung entfernt",
    actorUserId: req.userId!,
    metadata: { assigneeId: parsed.data.assigneeId },
  });
  res.json(incident);
});

const commentSchema = z.object({ message: z.string().trim().min(1).max(4000) }).strict();

incidentsRouter.post("/incidents/:id/comment", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const event = await addTimelineEvent({
    incidentId: id,
    eventType: "COMMENTED",
    message: parsed.data.message,
    actorUserId: req.userId!,
  });
  broadcast(createEvent(RealtimeEventType.INCIDENT_UPDATED, incident));
  res.status(201).json(event);
});

// ---------------------------------------------------------------------------
// Phase 26 "Enterprise Incident Postmortems & Retrospectives" - schliesst den
// Incident-Lifecycle (Phase 21) um eine strukturierte Nachbereitung
// (Root Cause/Impact/Resolution + Action Items). Dieselbe Sichtbarkeitsregel
// wie alle uebrigen /incidents-Routen oben: "authenticate" genuegt, keine
// zusaetzliche projekt-/organisationsbezogene RBAC (gemeinsame Ops-Konsole,
// siehe Kommentar am Dateianfang) - ein Postmortem ist ein Kollaborations-
// dokument fuer genau dieses Team, keine mandantenfaehige Ressource.
// ---------------------------------------------------------------------------

function buildTimelineNotesFromEvents(events: IncidentTimelineEvent[]): string {
  return events.map((e) => `[${e.createdAt}] ${e.eventType}: ${e.message}`).join("\n");
}

async function attachActionItems(postmortems: import("../types/postmortem.types").IncidentPostmortem[]): Promise<PostmortemWithActionItems[]> {
  const itemsByPostmortem = await listActionItemsForPostmortems(postmortems.map((p) => p.id));
  return postmortems.map((p) => ({ ...p, actionItems: itemsByPostmortem.get(p.id) ?? [] }));
}

const listPostmortemsQuerySchema = z.object({
  status: z.enum(POSTMORTEM_STATUSES as [PostmortemStatus, ...PostmortemStatus[]]).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

// Auftragspunkt "Postmortems-Uebersicht" - eigener, top-level Endpunkt (nicht
// unter /incidents/:id verschachtelt), fuer die Listenansicht ueber ALLE
// Postmortems hinweg (frontend/src/pages/Postmortems.tsx).
incidentsRouter.get("/postmortems", authenticate, async (req, res) => {
  const parsed = listPostmortemsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const postmortems = await listPostmortems({
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
  });
  res.json(await attachActionItems(postmortems));
});

incidentsRouter.get("/incidents/:id/postmortem", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  const postmortem = await getPostmortemByIncidentId(id);
  if (!postmortem) {
    throw notFoundError("Fuer diesen Incident existiert noch kein Postmortem");
  }
  const [withItems] = await attachActionItems([postmortem]);
  res.json(withItems);
});

const createPostmortemSchema = z
  .object({
    summary: z.string().trim().max(10_000).optional(),
    impact: z.string().trim().max(10_000).optional(),
    rootCause: z.string().trim().max(10_000).optional(),
    resolution: z.string().trim().max(10_000).optional(),
    timelineNotes: z.string().trim().max(20_000).optional(),
    // Auftragspunkt "Bestehende APIs verwenden" - statt den Aufrufer die
    // komplette Timeline manuell abtippen zu lassen, kann er sie sich hier
    // aus den ohnehin bereits gespeicherten incident_timeline_events (Phase
    // 21) vorbefuellen lassen. Wird ignoriert, wenn timelineNotes explizit
    // mitgeschickt wurde.
    useTimeline: z.boolean().optional(),
  })
  .strict();

incidentsRouter.post("/incidents/:id/postmortem", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  const parsed = createPostmortemSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  let timelineNotes = parsed.data.timelineNotes;
  if (timelineNotes === undefined && parsed.data.useTimeline) {
    const events = await getIncidentTimeline(id);
    timelineNotes = buildTimelineNotesFromEvents(events);
  }

  const postmortem = await createPostmortemIfNotExists({
    incidentId: id,
    ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
    ...(parsed.data.impact !== undefined ? { impact: parsed.data.impact } : {}),
    ...(parsed.data.rootCause !== undefined ? { rootCause: parsed.data.rootCause } : {}),
    ...(parsed.data.resolution !== undefined ? { resolution: parsed.data.resolution } : {}),
    ...(timelineNotes !== undefined ? { timelineNotes } : {}),
    ...(req.userId ? { createdBy: req.userId } : {}),
  });
  if (!postmortem) {
    throw new AppError(409, "CONFLICT", "Fuer diesen Incident existiert bereits ein Postmortem");
  }

  broadcast(createEvent(RealtimeEventType.INCIDENT_POSTMORTEM_CREATED, postmortem));
  void addTimelineEvent({
    incidentId: id,
    eventType: "COMMENTED",
    message: "Postmortem erstellt",
    actorUserId: req.userId!,
    metadata: { postmortemId: postmortem.id },
  });
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "POSTMORTEM_CREATED",
    category: "INCIDENT",
    projectId: incident.projectId,
    message: `Postmortem fuer Incident #${incident.id} erstellt`,
    metadata: { incidentId: incident.id, postmortemId: postmortem.id },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json({ ...postmortem, actionItems: [] });
});

const updatePostmortemSchema = z
  .object({
    status: z.enum(["DRAFT", "IN_REVIEW"] as const).optional(),
    summary: z.string().trim().max(10_000).nullable().optional(),
    impact: z.string().trim().max(10_000).nullable().optional(),
    rootCause: z.string().trim().max(10_000).nullable().optional(),
    resolution: z.string().trim().max(10_000).nullable().optional(),
    timelineNotes: z.string().trim().max(20_000).nullable().optional(),
  })
  .strict();

incidentsRouter.patch("/incidents/:id/postmortem", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const existing = await getPostmortemByIncidentId(id);
  if (!existing) {
    throw notFoundError("Fuer diesen Incident existiert noch kein Postmortem");
  }
  if (existing.status === "PUBLISHED") {
    throw new AppError(409, "CONFLICT", "Ein veroeffentlichtes Postmortem kann nicht mehr bearbeitet werden");
  }
  const parsed = updatePostmortemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const { status, summary, impact, rootCause, resolution, timelineNotes } = parsed.data;
  const updated = await updatePostmortem(existing.id, {
    ...(status !== undefined ? { status } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(impact !== undefined ? { impact } : {}),
    ...(rootCause !== undefined ? { rootCause } : {}),
    ...(resolution !== undefined ? { resolution } : {}),
    ...(timelineNotes !== undefined ? { timelineNotes } : {}),
  });
  if (!updated) {
    throw notFoundError("Postmortem nicht gefunden");
  }

  broadcast(createEvent(RealtimeEventType.INCIDENT_POSTMORTEM_UPDATED, updated));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "POSTMORTEM_UPDATED",
    category: "INCIDENT",
    message: `Postmortem fuer Incident #${id} aktualisiert`,
    metadata: { incidentId: id, postmortemId: updated.id },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  const [withItems] = await attachActionItems([updated]);
  res.json(withItems);
});

incidentsRouter.post("/incidents/:id/postmortem/publish", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const existing = await getPostmortemByIncidentId(id);
  if (!existing) {
    throw notFoundError("Fuer diesen Incident existiert noch kein Postmortem");
  }
  if (existing.status === "PUBLISHED") {
    throw new AppError(409, "CONFLICT", "Postmortem ist bereits veroeffentlicht");
  }
  if (!existing.summary?.trim() || !existing.rootCause?.trim()) {
    res.status(400).json({ error: "Summary und Root Cause sind vor der Veroeffentlichung erforderlich" });
    return;
  }

  const updated = await updatePostmortem(existing.id, { status: "PUBLISHED", publishedAt: new Date().toISOString() });
  if (!updated) {
    throw notFoundError("Postmortem nicht gefunden");
  }

  const actor = await getUserById(req.userId!);
  broadcast(createEvent(RealtimeEventType.INCIDENT_POSTMORTEM_UPDATED, updated));
  void addTimelineEvent({
    incidentId: id,
    eventType: "COMMENTED",
    message: `Postmortem veroeffentlicht von ${actor?.name ?? "einem Benutzer"}`,
    actorUserId: req.userId!,
    metadata: { postmortemId: updated.id },
  });
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "POSTMORTEM_PUBLISHED",
    category: "INCIDENT",
    message: `Postmortem fuer Incident #${id} veroeffentlicht`,
    metadata: { incidentId: id, postmortemId: updated.id },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  const [withItems] = await attachActionItems([updated]);
  res.json(withItems);
});

// ---------------------------------------------------------------------------
// Action Items
// ---------------------------------------------------------------------------

incidentsRouter.get("/incidents/:id/postmortem/action-items", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const postmortem = await getPostmortemByIncidentId(id);
  if (!postmortem) {
    throw notFoundError("Fuer diesen Incident existiert noch kein Postmortem");
  }
  res.json(await listActionItems(postmortem.id));
});

const createActionItemSchema = z
  .object({
    description: z.string().trim().min(1).max(2000),
    assigneeId: z.string().trim().min(1).optional(),
    dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate muss im Format YYYY-MM-DD sein").optional(),
  })
  .strict();

incidentsRouter.post("/incidents/:id/postmortem/action-items", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const postmortem = await getPostmortemByIncidentId(id);
  if (!postmortem) {
    throw notFoundError("Fuer diesen Incident existiert noch kein Postmortem");
  }
  const parsed = createActionItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.assigneeId) {
    const assignee = await getUserById(parsed.data.assigneeId);
    if (!assignee) {
      res.status(404).json({ error: "Benutzer nicht gefunden" });
      return;
    }
  }

  const item = await createActionItemIfUnderLimit(
    {
      postmortemId: postmortem.id,
      description: parsed.data.description,
      ...(parsed.data.assigneeId !== undefined ? { assigneeId: parsed.data.assigneeId } : {}),
      ...(parsed.data.dueDate !== undefined ? { dueDate: parsed.data.dueDate } : {}),
      ...(req.userId ? { createdBy: req.userId } : {}),
    },
    MAX_ACTION_ITEMS_PER_POSTMORTEM,
  );
  if (!item) {
    throw new AppError(409, "CONFLICT", `Limit erreicht: maximal ${MAX_ACTION_ITEMS_PER_POSTMORTEM} Action Items je Postmortem`);
  }

  broadcast(createEvent(RealtimeEventType.INCIDENT_POSTMORTEM_ACTION_ITEM_UPDATED, { postmortemId: postmortem.id, incidentId: id, actionItemId: item.id }));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "POSTMORTEM_ACTION_ITEM_CREATED",
    category: "INCIDENT",
    message: `Action Item fuer Postmortem #${postmortem.id} erstellt`,
    metadata: { incidentId: id, postmortemId: postmortem.id, actionItemId: item.id },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(item);
});

const updateActionItemSchema = z
  .object({
    description: z.string().trim().min(1).max(2000).optional(),
    assigneeId: z.string().trim().min(1).nullable().optional(),
    dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate muss im Format YYYY-MM-DD sein").nullable().optional(),
    status: z.enum(ACTION_ITEM_STATUSES as [string, ...string[]]).optional(),
  })
  .strict();

incidentsRouter.patch("/incidents/:id/postmortem/action-items/:itemId", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  const itemId = Number(req.params.itemId);
  if (id === undefined || !Number.isInteger(itemId)) {
    res.status(400).json({ error: "Ungueltige ID" });
    return;
  }
  const postmortem = await getPostmortemByIncidentId(id);
  if (!postmortem) {
    throw notFoundError("Fuer diesen Incident existiert noch kein Postmortem");
  }
  const existingItem = await getActionItemById(itemId);
  if (!existingItem || existingItem.postmortemId !== postmortem.id) {
    throw notFoundError("Action Item nicht gefunden");
  }
  const parsed = updateActionItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.assigneeId) {
    const assignee = await getUserById(parsed.data.assigneeId);
    if (!assignee) {
      res.status(404).json({ error: "Benutzer nicht gefunden" });
      return;
    }
  }

  const { description, assigneeId, dueDate, status } = parsed.data;
  const updated = await updateActionItem(itemId, {
    ...(description !== undefined ? { description } : {}),
    ...(assigneeId !== undefined ? { assigneeId } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(status !== undefined ? { status: status as import("../types/postmortem.types").ActionItemStatus } : {}),
  });
  if (!updated) {
    throw notFoundError("Action Item nicht gefunden");
  }

  broadcast(createEvent(RealtimeEventType.INCIDENT_POSTMORTEM_ACTION_ITEM_UPDATED, { postmortemId: postmortem.id, incidentId: id, actionItemId: updated.id }));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "POSTMORTEM_ACTION_ITEM_UPDATED",
    category: "INCIDENT",
    message: `Action Item #${updated.id} aktualisiert`,
    metadata: { incidentId: id, postmortemId: postmortem.id, actionItemId: updated.id },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

incidentsRouter.delete("/incidents/:id/postmortem/action-items/:itemId", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  const itemId = Number(req.params.itemId);
  if (id === undefined || !Number.isInteger(itemId)) {
    res.status(400).json({ error: "Ungueltige ID" });
    return;
  }
  const postmortem = await getPostmortemByIncidentId(id);
  if (!postmortem) {
    throw notFoundError("Fuer diesen Incident existiert noch kein Postmortem");
  }
  const existingItem = await getActionItemById(itemId);
  if (!existingItem || existingItem.postmortemId !== postmortem.id) {
    throw notFoundError("Action Item nicht gefunden");
  }
  await deleteActionItem(itemId);

  broadcast(createEvent(RealtimeEventType.INCIDENT_POSTMORTEM_ACTION_ITEM_UPDATED, { postmortemId: postmortem.id, incidentId: id, actionItemId: itemId }));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "POSTMORTEM_ACTION_ITEM_DELETED",
    category: "INCIDENT",
    message: `Action Item #${itemId} geloescht`,
    metadata: { incidentId: id, postmortemId: postmortem.id, actionItemId: itemId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(204).end();
});

// Phase 27 "Enterprise Deployment Tracking & Change Correlation" -
// Auftragspunkt "Incident-Korrelation": read-only, eigener Endpunkt statt
// die etablierte Incident-DTO zu erweitern (kein Regressionsrisiko fuer den
// bereits vom Frontend typisierten Vertrag), analog zu GET .../impact
// (Phase 25) neben der eigentlichen Detailroute. windowMinutes optional
// (Default/Max siehe types/deployment.types.ts).
incidentsRouter.get("/incidents/:id/recent-deployments", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  const windowMinutes = resolveDeploymentCorrelationWindowMinutes(req);
  const deployments = await getRecentDeploymentsForProject(incident.projectId, incident.createdAt, windowMinutes);
  res.json({ windowMinutes, deployments });
});

// Phase 28 (Fortsetzung) "Enterprise Change Management & Deployment
// Intelligence" Auftragspunkt 6 "Incident Correlation" - "Welche Changes
// fanden unmittelbar vor einem Incident statt?", exakt dasselbe Muster wie
// GET .../recent-deployments direkt darueber (windowMinutes optional,
// Default/Max siehe types/change.types.ts). Ergaenzt (verdraengt nicht)
// GET .../change-context, das den weiterhin unbeschraenkten "gibt es
// UEBERHAUPT einen Change-Kontext"-Signal liefert.
// Phase 29 "Enterprise Change Intelligence, Risk Correlation & Deployment
// Safety" Auftragspunkt 5 "Change Correlation Intelligence" - erweitert um
// "gemeinsamer kritischer Dependency-Pfad": zusaetzlich zu Changes auf dem
// GENAU BETROFFENEN Service ("same-service", unveraendertes Verhalten seit
// Phase 28) werden Changes auf dessen DIREKTEN Abhaengigkeiten ("upstream-
// dependency") im selben Zeitfenster gesucht - ein Change an einem Service,
// von dem der betroffene Service abhaengt, ist ein plausibler Root-Cause-
// Kandidat fuer einen neuen Incident, wurde bisher aber gar nicht
// gefunden (nur der exakt betroffene Service selbst wurde geprueft).
// Bewusst NUR ein Hop (nicht rekursiv transitiv): die bestehende Impact-
// Engine (core/topology.ts) deckt bereits die vollstaendige, tiefenbegrenzte
// Traversierung fuer die Change-Risikoanalyse (core/change-risk.ts) ab -
// hier reicht der direkte Pfad, um "nachvollziehbar" zu bleiben (Auftrag:
// "duerfen keine falschen Beziehungen behaupten" - je weiter entfernt die
// Abhaengigkeit, desto spekulativer die Kausalitaet). Batched: eine
// Abfrage fuer die direkten Abhaengigkeiten, dann EINE gemeinsame Change-
// Abfrage ueber alle betroffenen Service-Ids (kein N+1).
incidentsRouter.get("/incidents/:id/recent-changes", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  const windowMinutes = resolveChangeCorrelationWindowMinutes(req);
  const service = await getServiceByProjectId(incident.projectId);
  if (!service) {
    res.json({ windowMinutes, changes: [] });
    return;
  }

  const dependencies = await listDependenciesForService(service.id);
  const dependencyServiceIds = [...new Set(dependencies.map((d) => d.targetServiceId))];

  const [sameServiceChanges, dependencyChangesByService] = await Promise.all([
    getRecentChangesForService(service.id, incident.createdAt, windowMinutes),
    Promise.all(dependencyServiceIds.map((depId) => getRecentChangesForService(depId, incident.createdAt, windowMinutes))),
  ]);

  const correlated = new Map<number, { change: Change; correlationReason: "same-service" | "upstream-dependency" }>();
  for (const change of sameServiceChanges) correlated.set(change.id, { change, correlationReason: "same-service" });
  dependencyChangesByService.flat().forEach((change) => {
    if (!correlated.has(change.id)) correlated.set(change.id, { change, correlationReason: "upstream-dependency" });
  });

  const changes = [...correlated.values()]
    .sort((a, b) => new Date(b.change.actualStartAt ?? b.change.plannedStartAt ?? b.change.createdAt).getTime() - new Date(a.change.actualStartAt ?? a.change.plannedStartAt ?? a.change.createdAt).getTime())
    .map(({ change, correlationReason }) => ({ ...change, correlationReason }));

  res.json({ windowMinutes, changes });
});

// Phase 30 "Enterprise Reliability, Automated Recovery & Operational
// Resilience" Auftragspunkt 3 "Incident -> Recovery" - welche Recovery-
// Aktionen (= automation_rules mit trigger=INCIDENT_CREATED fuer das
// Projekt dieses Incidents) stehen zur Verfuegung, und was wuerde der
// Safety-Gate (core/recovery-safety.ts) JETZT dazu sagen. Rein lesend, kein
// N+1: eine Regel-Abfrage, danach je Regel ein kleiner, bereits batched-
// sicherer Safety-Check (siehe dortige Kommentare zu isChangeInProgress/
// getActiveMaintenanceWindow - beide pro Projekt, nicht pro Service).
incidentsRouter.get("/incidents/:id/recovery-actions", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }

  // Phase 32 "Enterprise Incident Command Center" - siehe core/recovery-
  // safety.ts#listRecoveryActionsForIncident() fuer die geteilte Logik.
  res.json(await listRecoveryActionsForIncident(incident));
});

const executeRecoverySchema = z.object({}).strict();

// Auftragspunkt 3/4/5 "Ausfuehrung"/"Safety Gates"/"Idempotenz" - EIN Klick
// deckt "Vorschlag erzeugen (falls noch keiner existiert) + Safety-Gate
// erneut (autoritativ, TOCTOU-sicher) pruefen + ausfuehren" ab, wenn die
// Regel approval_required=false hat. Erfordert approval_required=true eine
// Freigabe, wird HIER bewusst NICHT automatisch freigegeben (kein zweiter
// Freigabe-Workflow) - der Safety-Gate liefert dann BLOCKED mit Verweis auf
// den bestehenden Automation-Center-Freigabeprozess
// (PATCH /automation-actions/:id, POST /automation-actions/:id/execute).
incidentsRouter.post("/incidents/:id/recovery-actions/:ruleId/execute", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  const ruleId = Number(req.params.ruleId);
  if (id === undefined || !Number.isInteger(ruleId)) {
    res.status(400).json({ error: "Ungueltige Incident- oder Regel-ID" });
    return;
  }
  const parsed = executeRecoverySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  const rule = await getAutomationRuleById(ruleId);
  if (!rule || rule.projectId !== incident.projectId) {
    throw notFoundError("Recovery-Regel nicht gefunden");
  }
  if (!hasAutomationExecutor(rule.action)) {
    throw new AppError(400, "VALIDATION_ERROR", `Fuer "${rule.action}" existiert keine Ausfuehrungslogik`);
  }

  // Autoritative, TOCTOU-sichere Pruefung direkt vor der Ausfuehrung -
  // GET /recovery-actions oben liefert nur eine Momentaufnahme fuer die UI.
  const safety = await evaluateRecoverySafety(rule, incident);
  if (safety.verdict !== "READY") {
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "RECOVERY_BLOCKED",
      category: "AUTOMATION",
      severity: "WARNING",
      projectId: incident.projectId,
      message: `Recovery-Aktion "${rule.name}" fuer Incident #${id} blockiert: ${safety.verdict}${safety.reason ? ` - ${safety.reason}` : ""}`,
      metadata: { incidentId: id, ruleId, verdict: safety.verdict },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(409).json({ error: safety.reason ?? "Recovery-Aktion kann derzeit nicht ausgefuehrt werden", code: safety.verdict });
    return;
  }

  const action = await findOrCreateManualRecoveryAction({
    projectId: incident.projectId,
    incidentId: id,
    ruleId: rule.id,
    action: rule.action,
    trigger: `MANUAL_RECOVERY (Regel "${rule.name}")`,
  });

  const approvedAction = action.status === "APPROVED" ? action : ((await updateAutomationActionStatus(action.id, "APPROVED")) ?? action);

  const execution = await runAutomationExecution(approvedAction, {
    timeoutSeconds: rule.timeoutSeconds,
    ...(req.userId !== undefined ? { approvedBy: req.userId, executedBy: req.userId } : {}),
  });

  if (execution === "ALREADY_RUNNING") {
    res.status(409).json({ error: "Fuer diese Recovery-Aktion laeuft bereits eine Ausfuehrung", code: "ALREADY_RUNNING" });
    return;
  }

  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "RECOVERY_EXECUTED",
    category: "AUTOMATION",
    severity: execution.status === "SUCCESS" ? "INFO" : "WARNING",
    projectId: incident.projectId,
    message: `Recovery-Aktion "${rule.name}" fuer Incident #${id} manuell ausgefuehrt (${execution.status})`,
    metadata: { incidentId: id, ruleId, actionId: action.id, executionId: execution.id },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });

  res.status(execution.status === "SUCCESS" ? 200 : 502).json({ action: approvedAction, execution });
});

// Phase 27 "Enterprise On-Call & Escalation Management" Auftragspunkt 4
// "Incident Integration" - aktueller On-Call-Responder + Eskalationsstatus
// sichtbar. Eigener, read-only Endpunkt statt die etablierte Incident-DTO
// zu erweitern (kein Regressionsrisiko fuer den bereits vom Frontend
// typisierten Vertrag), analog zu GET .../recent-deployments oben.
incidentsRouter.get("/incidents/:id/escalation", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }

  // Phase 32 "Enterprise Incident Command Center" - Zusammensetzung nach
  // core/incident-escalation.ts#getIncidentEscalationSummary() ausgelagert,
  // damit dieser Endpunkt und der neue Command-Overview-Endpunkt exakt
  // dieselbe Logik verwenden.
  res.json(await getIncidentEscalationSummary(incident));
});

// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk" Auftragspunkt 5 "Incident Integration" - "anzeigen, ob ein aktiver
// Change/Maintenance-Kontext fuer den betroffenen Service existiert".
// Aufloesung: Incident -> Projekt -> Service (Phase 23, getServiceByProjectId)
// -> zugeordnete Changes (change_services). Reiner Lese-Endpunkt, eigene
// Route statt die Incident-DTO zu erweitern - exakt dasselbe Prinzip wie
// GET .../recent-deployments und GET .../escalation oben.
incidentsRouter.get("/incidents/:id/change-context", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }

  const [maintenanceWindows, service] = await Promise.all([
    listMaintenanceWindows({ projectId: incident.projectId }),
    getServiceByProjectId(incident.projectId),
  ]);

  // "waehrend eines aktiven Maintenance Windows" - relevant ist das Fenster,
  // das den Zeitpunkt der Incident-Erstellung ueberdeckt (falls das Projekt
  // aktuell WIEDER in Wartung ist, aber der Incident VOR diesem neuen
  // Fenster entstand, ist das nicht derselbe Kontext).
  const incidentCreatedAt = new Date(incident.createdAt).getTime();
  const relevantWindow = maintenanceWindows.find(
    (w) => new Date(w.startsAt).getTime() <= incidentCreatedAt && incidentCreatedAt < new Date(w.endsAt).getTime(),
  );

  const relatedChanges = service ? await listChangesForServiceIds([service.id]) : [];

  res.json({
    maintenanceWindow: relevantWindow ?? null,
    relatedChanges,
  });
});

// Phase 57 "Enterprise Operational Dependency & Blast Radius Assurance" -
// Bestandsanalyse-Ergebnis: GET /changes/:id/impact (Phase 29) existiert
// bereits und beantwortet "welche Services waeren von diesem Change
// betroffen" ueber denselben core/topology.ts#getFullImpactAnalysis() -
// die symmetrische Frage fuer Incidents ("welche Services waeren von DIESEM
// bereits laufenden Vorfall transitiv mitbetroffen") fehlte bisher
// vollstaendig (live per Bestandsanalyse bestaetigt - kein
// /incidents/:id/impact existierte). Dieselbe Autorisierung wie jede andere
// Route dieser Datei (authenticate-only, "gemeinsame Ops-Konsole ist nicht
// tenant-/projekt-gefiltert", siehe Kommentar bei GET /incidents oben) -
// KEIN neuer, staerkerer Autorisierungs-Standard fuer nur diese eine Route.
incidentsRouter.get("/incidents/:id/impact", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }

  const service = await getServiceByProjectId(incident.projectId);
  if (!service) {
    res.json({ service: null, impact: null, affectedServicesEnriched: [] });
    return;
  }

  const impact = await getFullImpactAnalysis(service);
  const affectedServicesEnriched = await enrichAffectedServicesWithStatus(impact.affectedServices);
  res.json({ service, impact, affectedServicesEnriched });
});

// ---------------------------------------------------------------------------
// Phase 31 "Enterprise Change/Incident Communication & Stakeholder
// Notification Intelligence"
// ---------------------------------------------------------------------------

// Auftragspunkt 4 "Communication History" + 5 "Automatische Communication
// Suggestions" - EIN Aufruf liefert beides (Historie + aktuelle
// Empfehlungen), damit das Frontend fuer den Communication-Tab nicht zwei
// Roundtrips braucht (Auftragspunkt 18 "Performance" - Ziel <100ms).
incidentsRouter.get("/incidents/:id/communications", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }

  const [communications, recommendations] = await Promise.all([
    listCommunicationsForIncident(id),
    buildCommunicationRecommendations(incident),
  ]);

  res.json({ communications, recommendations });
});

const createCommunicationSchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    severity: z.enum(COMMUNICATION_SEVERITIES as [CommunicationSeverity, ...CommunicationSeverity[]]).default("INFO"),
    targetUserId: z.string().trim().min(1).optional(),
    targetScheduleId: z.number().int().positive().optional(),
    notificationChannelId: z.enum(NOTIFICATION_CHANNEL_IDS).optional(),
  })
  .strict()
  .refine((data) => !(data.targetUserId !== undefined && data.targetScheduleId !== undefined), {
    message: "targetUserId und targetScheduleId duerfen nicht gleichzeitig gesetzt werden",
    path: ["targetUserId"],
  });

// Auftragspunkt 3 "Incident Communication erstellen" + 6 "Communication
// Safety" + 7 "Deduplication/Idempotency" - derselbe Aufbau wie der Phase-30-
// Recovery-Execute-Endpunkt: autoritative Safety-Pruefung direkt vor dem
// INSERT, das den TOCTOU-Rest ueber die partielle Unique-Constraint
// (Migration 0054) race-sicher abfaengt.
incidentsRouter.post("/incidents/:id/communications", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const parsed = createCommunicationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }

  const { message, severity, targetUserId, targetScheduleId, notificationChannelId } = parsed.data;
  const targetType: CommunicationTargetType = targetUserId !== undefined ? "USER" : targetScheduleId !== undefined ? "ON_CALL_SCHEDULE" : "GENERAL";

  // Auftragspunkt 6 "Ziel existiert" - fuer ON_CALL_SCHEDULE zusaetzlich zur
  // Tenant-Pruefung im Safety-Gate: eine nicht existierende Schedule-ID darf
  // nicht erst als "falsche Organisation" maskiert werden, sondern klar
  // 404/400 melden, bevor ueberhaupt der Safety-Gate laeuft.
  if (targetScheduleId !== undefined) {
    const scheduleOrgId = await getOnCallScheduleOrganizationId(targetScheduleId);
    if (!scheduleOrgId) {
      res.status(404).json({ error: "On-Call-Schedule nicht gefunden" });
      return;
    }
  }
  if (targetUserId !== undefined) {
    const targetUser = await getUserById(targetUserId);
    if (!targetUser) {
      res.status(404).json({ error: "Zielbenutzer nicht gefunden" });
      return;
    }
  }

  const safety = await evaluateCommunicationSafety(
    incident,
    { targetType, ...(targetUserId !== undefined ? { targetUserId } : {}), ...(targetScheduleId !== undefined ? { targetScheduleId } : {}) },
    message,
  );
  if (safety.verdict !== "READY") {
    const statusCode = safety.verdict === "INVALID_TARGET" ? 400 : 409;
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "INCIDENT_COMMUNICATION_BLOCKED",
      category: "NOTIFICATION",
      severity: "WARNING",
      projectId: incident.projectId,
      message: `Communication fuer Incident #${id} blockiert: ${safety.verdict}${safety.reason ? ` - ${safety.reason}` : ""}`,
      metadata: { incidentId: id, targetType, verdict: safety.verdict },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(statusCode).json({ error: safety.reason ?? "Communication kann derzeit nicht gesendet werden", code: safety.verdict });
    return;
  }

  const created = await createIncidentCommunication({
    incidentId: id,
    message,
    severity,
    targetType,
    ...(targetUserId !== undefined ? { targetUserId } : {}),
    ...(targetScheduleId !== undefined ? { targetScheduleId } : {}),
    ...(notificationChannelId !== undefined ? { notificationChannelId: notificationChannelId as NotificationChannelId } : {}),
    ...(req.userId ? { createdBy: req.userId } : {}),
  });

  // Race-Safety-Backstop (Auftragspunkt 7): zwei parallele, identische
  // Requests koennen beide den Safety-Gate als READY durchlaufen (TOCTOU) -
  // der DB-Unique-Index entscheidet autoritativ, welcher zuerst ankam.
  if (created === "DUPLICATE") {
    res.status(409).json({ error: "Identische Kommunikation wurde bereits gesendet", code: "ALREADY_SENT" });
    return;
  }

  // Auftragspunkt 9 "Incident Timeline" - bestehender Event-Typ
  // 'NOTIFICATION_SENT' (Migration 0041), keine zweite Timeline.
  void addTimelineEvent({
    incidentId: id,
    eventType: "NOTIFICATION_SENT",
    message: `Communication gesendet${targetType === "USER" ? " an einen Benutzer" : targetType === "ON_CALL_SCHEDULE" ? " an ein On-Call-Schedule" : ""}: "${message}"`,
    metadata: { communicationId: created.id, targetType, severity },
    ...(req.userId ? { actorUserId: req.userId } : {}),
  });

  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "INCIDENT_COMMUNICATION_CREATED",
    category: "NOTIFICATION",
    projectId: incident.projectId,
    message: `Communication fuer Incident #${id} gesendet (Ziel: ${targetType})`,
    metadata: { incidentId: id, communicationId: created.id, targetType, severity },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });

  broadcast(createEvent(RealtimeEventType.INCIDENT_COMMUNICATION_CREATED, created));
  res.status(201).json(created);
});

// ---------------------------------------------------------------------------
// Phase 32 "Enterprise Incident Command Center & Operational Coordination"
// ---------------------------------------------------------------------------

// Auftragspunkt 3 "API" - Rollen + Checklist, ohne die teureren
// Aggregationen aus /command/overview (Escalation/Recovery/Communication/
// Change-Intelligence/Impact/Postmortem/Timeline) - fuer den Fall, dass ein
// Client nur den reinen Command-Zustand braucht.
incidentsRouter.get("/incidents/:id/command", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  res.json(await getCommandState(id));
});

// Auftragspunkt 4 "Incident Command Status" - EIN Response mit allen fuer
// die Command-Mode-UI benoetigten Signalen (core/incident-command.ts#
// buildCommandOverview - reine Aggregation bestehender Engines).
incidentsRouter.get("/incidents/:id/command/overview", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  res.json(await buildCommandOverview(incident));
});

async function assertCommandTargetUserValid(incident: import("../types/incident.types").Incident, userId: string): Promise<void> {
  const organizationId = await getProjectOrganizationId(incident.projectId);
  if (!organizationId) {
    throw new AppError(400, "VALIDATION_ERROR", "Projekt dieses Incidents ist keiner Organisation zugeordnet");
  }
  const membership = await getOrganizationMembership(organizationId, userId);
  if (!membership) {
    throw new AppError(400, "VALIDATION_ERROR", "Zielbenutzer ist kein Mitglied der Organisation dieses Incidents");
  }
}

const upsertRoleSchema = z
  .object({
    role: z.enum(INCIDENT_COMMAND_ROLE_TYPES as [IncidentCommandRoleType, ...IncidentCommandRoleType[]]),
    userId: z.string().trim().min(1),
  })
  .strict();

// Auftragspunkt 2/3 "Command Rollen"/"API" - dieselbe Tenant-Pruefung wie
// Phase 31 (Ziel muss Mitglied der Organisation dieses Incidents sein).
// Race-Safety (Auftragspunkt 19) via ON CONFLICT (Migration 0055) - kein
// Anwendungscode-Lock noetig.
incidentsRouter.put("/incidents/:id/command/roles", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Incident-ID" });
    return;
  }
  const parsed = upsertRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  const targetUser = await getUserById(parsed.data.userId);
  if (!targetUser) {
    res.status(404).json({ error: "Zielbenutzer nicht gefunden" });
    return;
  }
  await assertCommandTargetUserValid(incident, parsed.data.userId);

  const role = await upsertCommandRole(id, parsed.data.role, parsed.data.userId, req.userId);

  void addTimelineEvent({
    incidentId: id,
    eventType: "COMMAND_UPDATED",
    message: `${parsed.data.role.replaceAll("_", " ")} set to ${targetUser.name}`,
    metadata: { role: parsed.data.role, userId: parsed.data.userId },
    ...(req.userId ? { actorUserId: req.userId } : {}),
  });
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "INCIDENT_COMMAND_ROLE_ASSIGNED",
    category: "INCIDENT",
    projectId: incident.projectId,
    message: `Command-Rolle ${parsed.data.role} fuer Incident #${id} zugewiesen`,
    metadata: { incidentId: id, role: parsed.data.role, userId: parsed.data.userId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  broadcast(createEvent(RealtimeEventType.INCIDENT_COMMAND_UPDATED, { incidentId: id }));
  res.status(200).json(role);
});

incidentsRouter.delete("/incidents/:id/command/roles/:role", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  const roleParam = req.params.role;
  if (id === undefined || !INCIDENT_COMMAND_ROLE_TYPES.includes(roleParam as IncidentCommandRoleType)) {
    res.status(400).json({ error: "Ungueltige Incident-ID oder Rolle" });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  const role = roleParam as IncidentCommandRoleType;
  const deleted = await deleteCommandRole(id, role);
  if (!deleted) {
    throw notFoundError("Diese Rolle ist fuer diesen Incident nicht zugewiesen");
  }

  void addTimelineEvent({
    incidentId: id,
    eventType: "COMMAND_UPDATED",
    message: `${role.replaceAll("_", " ")} unassigned`,
    metadata: { role },
    ...(req.userId ? { actorUserId: req.userId } : {}),
  });
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "INCIDENT_COMMAND_ROLE_UNASSIGNED",
    category: "INCIDENT",
    projectId: incident.projectId,
    message: `Command-Rolle ${role} fuer Incident #${id} entfernt`,
    metadata: { incidentId: id, role },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  broadcast(createEvent(RealtimeEventType.INCIDENT_COMMAND_UPDATED, { incidentId: id }));
  res.status(204).end();
});

const updateChecklistSchema = z.object({ status: z.enum(CHECKLIST_ITEM_STATUSES as [ChecklistItemStatus, ...ChecklistItemStatus[]]) }).strict();

incidentsRouter.put("/incidents/:id/command/checklist/:itemKey", authenticate, async (req, res) => {
  const id = parseIncidentId(req);
  const itemKeyParam = req.params.itemKey;
  if (id === undefined || !CHECKLIST_ITEM_KEYS.includes(itemKeyParam as ChecklistItemKey)) {
    res.status(400).json({ error: "Ungueltige Incident-ID oder Checklist-Item" });
    return;
  }
  const parsed = updateChecklistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const incident = await getIncidentById(id);
  if (!incident) {
    throw notFoundError("Incident nicht gefunden");
  }
  const itemKey = itemKeyParam as ChecklistItemKey;
  const item = await upsertChecklistItem(id, itemKey, parsed.data.status, req.userId);

  void addTimelineEvent({
    incidentId: id,
    eventType: "COMMAND_UPDATED",
    message: `Checklist item "${itemKey.replaceAll("_", " ")}" set to ${parsed.data.status}`,
    metadata: { itemKey, status: parsed.data.status },
    ...(req.userId ? { actorUserId: req.userId } : {}),
  });
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "INCIDENT_COMMAND_CHECKLIST_UPDATED",
    category: "INCIDENT",
    projectId: incident.projectId,
    message: `Checklist-Item ${itemKey} fuer Incident #${id} auf ${parsed.data.status} gesetzt`,
    metadata: { incidentId: id, itemKey, status: parsed.data.status },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  broadcast(createEvent(RealtimeEventType.INCIDENT_COMMAND_UPDATED, { incidentId: id }));
  res.status(200).json(item);
});
