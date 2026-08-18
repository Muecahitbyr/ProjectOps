import { Router } from "express";
import { z } from "zod";
import type { Request } from "express";
import {
  buildProblemOverview,
  createProblem,
  deleteProblem,
  getProblemById,
  getProblemDetail,
  getProblemCandidates,
  isValidProblemOwner,
  linkChange,
  linkIncident,
  unlinkChange,
  unlinkIncident,
  updateProblem,
} from "../core/problem-management";
import { getProblemOrganizationId } from "../db/problems.repository";
import { getProblemEffectiveness, getSingleChangeEffectiveness } from "../core/remediation-effectiveness";
import { getIncidentById } from "../db/incidents.repository";
import { getChangeById, getChangeOrganizationId } from "../db/changes.repository";
import { getProjectOrganizationId } from "../db/projects.repository";
import { authenticate } from "../middleware/authenticate";
import { authorizePlatformOrOrganizationMembership, authorizePlatformOrOrganizationRole } from "../middleware/authorize";
import { notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { PROBLEM_PRIORITIES, PROBLEM_STATUSES } from "../types/problem.types";
import type { ProblemPriority, ProblemStatus } from "../types/problem.types";
import type { OrganizationRoleId } from "../types/organization.types";

// Phase 35 "Enterprise Problem Management & Root-Cause Intelligence" -
// dasselbe RBAC-Muster wie changes.routes.ts/platform-slo.routes.ts:
// authorizePlatformOrOrganizationMembership() fuer lesende, authorizePlatform
// OrOrganizationRole(MANAGE_ROLES) fuer mutierende Endpunkte.
export const problemsRouter = Router();

const MANAGE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "OPERATOR", "DEVELOPER"];

async function resolveOrgIdFromQuery(req: Request): Promise<string | undefined> {
  return typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
}
async function resolveOrgIdFromBody(req: Request): Promise<string | undefined> {
  return typeof req.body?.organizationId === "string" ? req.body.organizationId : undefined;
}
async function resolveOrgIdForProblem(req: Request): Promise<string | null> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return null;
  return (await getProblemOrganizationId(id)) ?? null;
}

function parseProblemId(req: Request): number | null {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : null;
}

// ---------------------------------------------------------------------------
// GET /problems - Overview (Kacheln, IMMER organisationsweit) + gefilterte
// Tabelle
// ---------------------------------------------------------------------------
const listQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(PROBLEM_STATUSES as [ProblemStatus, ...ProblemStatus[]]).optional(),
  priority: z.enum(PROBLEM_PRIORITIES as [ProblemPriority, ...ProblemPriority[]]).optional(),
  ownerUserId: z.string().trim().min(1).optional(),
});

problemsRouter.get("/problems", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const { organizationId, status, priority, ownerUserId } = parsed.data;
  res.json(
    await buildProblemOverview(organizationId, {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(ownerUserId ? { ownerUserId } : {}),
    }),
  );
});

// Auftragspunkt 11 "Problem Candidates" - bewusst VOR /problems/:id
// registriert (sonst wuerde Express "candidates" als :id-Parameter
// interpretieren, derselbe Stolperstein wie bei allen anderen Routern mit
// festen Unterpfaden in dieser Codebase, z.B. /changes/:id vs. feste Pfade).
const candidatesQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  hours: z.coerce.number().int().positive().max(24 * 365).optional(),
  minCount: z.coerce.number().int().min(2).max(50).optional(),
});

problemsRouter.get("/problems/candidates", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = candidatesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const { organizationId, hours, minCount } = parsed.data;
  res.json(
    await getProblemCandidates({
      organizationId,
      hours: hours ?? 24 * 30,
      ...(minCount !== undefined ? { minCount } : {}),
    }),
  );
});

problemsRouter.get("/problems/:id", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForProblem), async (req, res) => {
  const id = parseProblemId(req);
  if (id === null) {
    res.status(400).json({ error: "Ungueltige Problem-ID" });
    return;
  }
  const detail = await getProblemDetail(id);
  if (!detail) {
    throw notFoundError("Problem nicht gefunden");
  }
  res.json(detail);
});

// ---------------------------------------------------------------------------
// Phase 36 "Enterprise Remediation & Change Effectiveness Intelligence"
// Auftragspunkt 18 "API" - rein lesend, kein POST/PATCH noetig (Auftrag
// explizit). windowDays ist bewusst auf ein festes, dokumentiertes Set
// beschraenkt (7/14/30 Tage) statt eines beliebigen Wertes - deterministische
// Fenster, keine "beliebigen Zahlen".
// ---------------------------------------------------------------------------
const effectivenessQuerySchema = z.object({
  windowDays: z.coerce.number().refine((v) => [7, 14, 30].includes(v), { message: "windowDays muss 7, 14 oder 30 sein" }).optional(),
});

problemsRouter.get("/problems/:id/effectiveness", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForProblem), async (req, res) => {
  const id = parseProblemId(req);
  if (id === null) {
    res.status(400).json({ error: "Ungueltige Problem-ID" });
    return;
  }
  const parsed = effectivenessQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltiges windowDays", details: parsed.error.flatten() });
    return;
  }
  const result = await getProblemEffectiveness(id, parsed.data.windowDays ?? 14);
  if (!result) {
    throw notFoundError("Problem nicht gefunden");
  }
  res.json(result);
});

problemsRouter.get("/problems/:id/effectiveness/:changeId", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForProblem), async (req, res) => {
  const id = parseProblemId(req);
  const changeId = Number(req.params.changeId);
  if (id === null || !Number.isInteger(changeId)) {
    res.status(400).json({ error: "Ungueltige Problem- oder Change-ID" });
    return;
  }
  const parsed = effectivenessQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltiges windowDays", details: parsed.error.flatten() });
    return;
  }
  const result = await getSingleChangeEffectiveness(id, changeId, parsed.data.windowDays ?? 14);
  if (result === undefined) {
    throw notFoundError("Problem nicht gefunden");
  }
  // Auftragspunkt 20 "Tenant Isolation" - ein Change, der nicht mit DIESEM
  // Problem verknuepft ist (egal ob er ueberhaupt existiert, zu einer
  // fremden Organisation gehoert, oder schlicht nie verlinkt wurde), liefert
  // einheitlich 404 - niemals Daten eines fremden Changes.
  if (result === "NOT_LINKED") {
    throw notFoundError("Change ist nicht mit diesem Problem verknuepft");
  }
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /problems - Create
// ---------------------------------------------------------------------------
const createSchema = z
  .object({
    organizationId: z.string().trim().min(1),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).optional(),
    status: z.enum(PROBLEM_STATUSES as [ProblemStatus, ...ProblemStatus[]]).optional(),
    priority: z.enum(PROBLEM_PRIORITIES as [ProblemPriority, ...ProblemPriority[]]).optional(),
    ownerUserId: z.string().trim().min(1).optional(),
    rootCause: z.string().trim().max(4000).optional(),
    workaround: z.string().trim().max(4000).optional(),
    remediation: z.string().trim().max(4000).optional(),
  })
  .strict();

problemsRouter.post("/problems", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdFromBody), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const { organizationId, title, description, status, priority, ownerUserId, rootCause, workaround, remediation } = parsed.data;

  // Auftragspunkt 26 "Owner" - tenant-sicher: der Owner MUSS Mitglied dieser
  // Organisation sein (oder Platform Owner), sonst 400 statt eines stillen
  // Cross-Tenant-Owner-Zuweisung.
  if (ownerUserId !== undefined && !(await isValidProblemOwner(organizationId, ownerUserId))) {
    res.status(400).json({ error: "ownerUserId ist kein Mitglied dieser Organisation" });
    return;
  }

  const problem = await createProblem({
    organizationId,
    title,
    ...(description !== undefined ? { description } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(ownerUserId !== undefined ? { ownerUserId } : {}),
    ...(rootCause !== undefined ? { rootCause } : {}),
    ...(workaround !== undefined ? { workaround } : {}),
    ...(remediation !== undefined ? { remediation } : {}),
    ...(req.userId ? { createdBy: req.userId } : {}),
  });

  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "PROBLEM_CREATED",
    category: "PROBLEM",
    message: `Problem "${problem.title}" erstellt`,
    metadata: { problemId: problem.id, organizationId: problem.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  broadcast(createEvent(RealtimeEventType.PROBLEM_UPDATED, { problemId: problem.id, organizationId: problem.organizationId }));
  res.status(201).json(problem);
});

// ---------------------------------------------------------------------------
// PATCH /problems/:id - Update (Status/Priority/Owner/RootCause/Workaround/
// Remediation/Title/Description)
// ---------------------------------------------------------------------------
const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    status: z.enum(PROBLEM_STATUSES as [ProblemStatus, ...ProblemStatus[]]).optional(),
    priority: z.enum(PROBLEM_PRIORITIES as [ProblemPriority, ...ProblemPriority[]]).optional(),
    ownerUserId: z.string().trim().min(1).nullable().optional(),
    rootCause: z.string().trim().max(4000).nullable().optional(),
    workaround: z.string().trim().max(4000).nullable().optional(),
    remediation: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

problemsRouter.patch("/problems/:id", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForProblem), async (req, res) => {
  const id = parseProblemId(req);
  if (id === null) {
    res.status(400).json({ error: "Ungueltige Problem-ID" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const existing = await getProblemById(id);
  if (!existing) {
    throw notFoundError("Problem nicht gefunden");
  }
  const { title, description, status, priority, ownerUserId, rootCause, workaround, remediation } = parsed.data;

  if (ownerUserId !== undefined && ownerUserId !== null && !(await isValidProblemOwner(existing.organizationId, ownerUserId))) {
    res.status(400).json({ error: "ownerUserId ist kein Mitglied dieser Organisation" });
    return;
  }

  const updated = await updateProblem(id, {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(ownerUserId !== undefined ? { ownerUserId } : {}),
    ...(rootCause !== undefined ? { rootCause } : {}),
    ...(workaround !== undefined ? { workaround } : {}),
    ...(remediation !== undefined ? { remediation } : {}),
  });
  if (!updated) {
    throw notFoundError("Problem nicht gefunden");
  }

  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "PROBLEM_UPDATED",
    category: "PROBLEM",
    message: `Problem "${updated.title}" aktualisiert`,
    metadata: { problemId: updated.id, organizationId: updated.organizationId, changes: parsed.data },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  broadcast(createEvent(RealtimeEventType.PROBLEM_UPDATED, { problemId: updated.id, organizationId: updated.organizationId }));
  res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /problems/:id
// ---------------------------------------------------------------------------
problemsRouter.delete("/problems/:id", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForProblem), async (req, res) => {
  const id = parseProblemId(req);
  if (id === null) {
    res.status(400).json({ error: "Ungueltige Problem-ID" });
    return;
  }
  const existing = await getProblemById(id);
  if (!existing) {
    throw notFoundError("Problem nicht gefunden");
  }
  await deleteProblem(id);
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "PROBLEM_DELETED",
    category: "PROBLEM",
    message: `Problem "${existing.title}" geloescht`,
    metadata: { problemId: existing.id, organizationId: existing.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  broadcast(createEvent(RealtimeEventType.PROBLEM_UPDATED, { problemId: existing.id, organizationId: existing.organizationId }));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Auftragspunkt 5 "Problem <-> Incident" - Link/Unlink, tenant-sicher: der
// Incident MUSS (ueber sein Projekt) zur selben Organisation gehoeren wie
// das Problem (Auftragspunkt 19 "Tenant Isolation" - "nicht nur die
// Haupttabelle pruefen").
// ---------------------------------------------------------------------------
async function resolveIncidentOrganizationId(incidentId: number): Promise<string | undefined> {
  const incident = await getIncidentById(incidentId);
  if (!incident) return undefined;
  return getProjectOrganizationId(incident.projectId);
}

problemsRouter.post(
  "/problems/:id/incidents/:incidentId",
  authenticate,
  authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForProblem),
  async (req, res) => {
    const problemId = parseProblemId(req);
    const incidentId = Number(req.params.incidentId);
    if (problemId === null || !Number.isInteger(incidentId)) {
      res.status(400).json({ error: "Ungueltige Problem- oder Incident-ID" });
      return;
    }
    const problem = await getProblemById(problemId);
    if (!problem) {
      throw notFoundError("Problem nicht gefunden");
    }
    const incidentOrgId = await resolveIncidentOrganizationId(incidentId);
    if (incidentOrgId === undefined) {
      throw notFoundError("Incident nicht gefunden");
    }
    if (incidentOrgId !== problem.organizationId) {
      // Bewusst 404 statt 403 - dieselbe "kein Leck ueber den Statuscode"-
      // Konvention wie bei fremden Service-/Change-Referenzen an anderer
      // Stelle in dieser Codebase (z.B. changes.routes.ts Service-Validierung).
      throw notFoundError("Incident nicht gefunden");
    }

    const link = await linkIncident(problemId, incidentId, req.userId ?? null);
    if (!link) {
      // ON CONFLICT DO NOTHING (Migration 0057 UNIQUE-Constraint) - bereits
      // verknuepft, kein Fehler (idempotent), aber auch kein neuer Audit-
      // Eintrag fuer ein No-Op.
      res.status(200).json({ alreadyLinked: true });
      return;
    }

    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "PROBLEM_INCIDENT_LINKED",
      category: "PROBLEM",
      message: `Incident #${incidentId} mit Problem "${problem.title}" verknuepft`,
      metadata: { problemId, incidentId, organizationId: problem.organizationId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    broadcast(createEvent(RealtimeEventType.PROBLEM_UPDATED, { problemId, organizationId: problem.organizationId }));
    res.status(201).json(link);
  },
);

problemsRouter.delete(
  "/problems/:id/incidents/:incidentId",
  authenticate,
  authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForProblem),
  async (req, res) => {
    const problemId = parseProblemId(req);
    const incidentId = Number(req.params.incidentId);
    if (problemId === null || !Number.isInteger(incidentId)) {
      res.status(400).json({ error: "Ungueltige Problem- oder Incident-ID" });
      return;
    }
    const problem = await getProblemById(problemId);
    if (!problem) {
      throw notFoundError("Problem nicht gefunden");
    }
    const removed = await unlinkIncident(problemId, incidentId);
    if (!removed) {
      throw notFoundError("Verknuepfung nicht gefunden");
    }
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "PROBLEM_INCIDENT_UNLINKED",
      category: "PROBLEM",
      message: `Incident #${incidentId} von Problem "${problem.title}" entfernt`,
      metadata: { problemId, incidentId, organizationId: problem.organizationId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    broadcast(createEvent(RealtimeEventType.PROBLEM_UPDATED, { problemId, organizationId: problem.organizationId }));
    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// Auftragspunkt 9 "Problem <-> Change" - dieselbe Tenant-Pruefung wie oben.
// ---------------------------------------------------------------------------
problemsRouter.post(
  "/problems/:id/changes/:changeId",
  authenticate,
  authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForProblem),
  async (req, res) => {
    const problemId = parseProblemId(req);
    const changeId = Number(req.params.changeId);
    if (problemId === null || !Number.isInteger(changeId)) {
      res.status(400).json({ error: "Ungueltige Problem- oder Change-ID" });
      return;
    }
    const problem = await getProblemById(problemId);
    if (!problem) {
      throw notFoundError("Problem nicht gefunden");
    }
    const change = await getChangeById(changeId);
    if (!change) {
      throw notFoundError("Change nicht gefunden");
    }
    const changeOrgId = await getChangeOrganizationId(changeId);
    if (changeOrgId !== problem.organizationId) {
      throw notFoundError("Change nicht gefunden");
    }

    const link = await linkChange(problemId, changeId, req.userId ?? null);
    if (!link) {
      res.status(200).json({ alreadyLinked: true });
      return;
    }
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "PROBLEM_CHANGE_LINKED",
      category: "PROBLEM",
      message: `Change #${changeId} mit Problem "${problem.title}" verknuepft`,
      metadata: { problemId, changeId, organizationId: problem.organizationId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    broadcast(createEvent(RealtimeEventType.PROBLEM_UPDATED, { problemId, organizationId: problem.organizationId }));
    res.status(201).json(link);
  },
);

problemsRouter.delete(
  "/problems/:id/changes/:changeId",
  authenticate,
  authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForProblem),
  async (req, res) => {
    const problemId = parseProblemId(req);
    const changeId = Number(req.params.changeId);
    if (problemId === null || !Number.isInteger(changeId)) {
      res.status(400).json({ error: "Ungueltige Problem- oder Change-ID" });
      return;
    }
    const problem = await getProblemById(problemId);
    if (!problem) {
      throw notFoundError("Problem nicht gefunden");
    }
    const removed = await unlinkChange(problemId, changeId);
    if (!removed) {
      throw notFoundError("Verknuepfung nicht gefunden");
    }
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "PROBLEM_CHANGE_UNLINKED",
      category: "PROBLEM",
      message: `Change #${changeId} von Problem "${problem.title}" entfernt`,
      metadata: { problemId, changeId, organizationId: problem.organizationId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    broadcast(createEvent(RealtimeEventType.PROBLEM_UPDATED, { problemId, organizationId: problem.organizationId }));
    res.status(204).end();
  },
);
