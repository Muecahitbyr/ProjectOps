import { Router } from "express";
import { z } from "zod";
import type { Request } from "express";
import {
  createOnCallScheduleIfUnderQuota,
  createOverrideIfNoOverlap,
  deleteOnCallOverride,
  deleteOnCallSchedule,
  getOnCallOverrideById,
  getOnCallScheduleById,
  getOnCallScheduleOrganizationId,
  listOnCallOverrides,
  listOnCallOverridesInRange,
  listOnCallScheduleMembers,
  listOnCallSchedules,
  replaceOnCallScheduleMembers,
  updateOnCallSchedule,
} from "../db/on-call.repository";
import { getOrganizationById } from "../db/organizations.repository";
import { getTeamById, listTeamMembers } from "../db/teams.repository";
import { getPlanLimits } from "../config/plan-limits";
import { resolveCurrentOnCall, buildOnCallTimeline } from "../core/on-call";
import { ON_CALL_ROTATION_TYPES } from "../types/on-call.types";
import type { OnCallRotationType, CurrentOnCallWithUser } from "../types/on-call.types";
import { authenticate } from "../middleware/authenticate";
import { authorizePlatformOrOrganizationMembership, authorizePlatformOrOrganizationRole } from "../middleware/authorize";
import { AppError, notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { getUserById } from "../db/users.repository";
import type { OrganizationRoleId } from "../types/organization.types";

// Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" - dieselbe
// Struktur wie routes/platform-slo.routes.ts (Phase 22) / routes/platform-
// services.routes.ts (Phase 23): CRUD unter session-Auth, aber von Anfang an
// mit dem KORREKTEN, organisationsscharfen RBAC (authorizePlatformOr
// Organization{Membership,Role}(), siehe middleware/authorize.ts) statt der
// zu breiten authorizePlatformOwner()-Pruefung, die in genau diesen beiden
// Vorgaenger-Routern den in diesem Phasenbericht dokumentierten Cross-Tenant-
// Bug verursacht hatte.
export const onCallRouter = Router();

const MANAGE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "OPERATOR", "DEVELOPER"];

async function resolveOrgIdFromQuery(req: Request): Promise<string | undefined> {
  return typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
}

async function resolveOrgIdFromBody(req: Request): Promise<string | undefined> {
  return typeof req.body?.organizationId === "string" ? req.body.organizationId : undefined;
}

async function resolveOrgIdForSchedule(req: Request): Promise<string | null> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return null;
  return (await getOnCallScheduleOrganizationId(id)) ?? null;
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  organizationId: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1).optional(),
  enabled: z.enum(["true", "false"]).optional(),
});

onCallRouter.get("/on-call/schedules", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const schedules = await listOnCallSchedules({
    ...(parsed.data.organizationId ? { organizationId: parsed.data.organizationId } : {}),
    ...(parsed.data.teamId ? { teamId: parsed.data.teamId } : {}),
    ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled === "true" } : {}),
  });
  res.json(schedules);
});

onCallRouter.get("/on-call/schedules/:id", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForSchedule), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Schedule-ID" });
    return;
  }
  const schedule = await getOnCallScheduleById(id);
  if (!schedule) {
    throw notFoundError("On-Call-Schedule nicht gefunden");
  }
  res.json(schedule);
});

onCallRouter.get("/on-call/schedules/:id/members", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForSchedule), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Schedule-ID" });
    return;
  }
  const schedule = await getOnCallScheduleById(id);
  if (!schedule) {
    throw notFoundError("On-Call-Schedule nicht gefunden");
  }
  res.json(await listOnCallScheduleMembers(id));
});

// Auftragspunkt "wer ist gerade dran" - Kernwert des Features. Liefert
// zusaetzlich Name/E-Mail des Diensthabenden (ein Frontend-Aufruf statt
// einer zweiten Nachfrage bei users), analog zu attachCurrentStatus() in
// platform-slo.routes.ts (Phase 22).
onCallRouter.get("/on-call/schedules/:id/current", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForSchedule), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Schedule-ID" });
    return;
  }
  const schedule = await getOnCallScheduleById(id);
  if (!schedule) {
    throw notFoundError("On-Call-Schedule nicht gefunden");
  }
  const now = new Date();
  const [members, overrides] = await Promise.all([
    listOnCallScheduleMembers(id),
    listOnCallOverridesInRange(id, now, now),
  ]);
  const current = resolveCurrentOnCall(id, schedule, members, overrides, now);
  const user = current.userId ? await getUserById(current.userId) : undefined;
  const withUser: CurrentOnCallWithUser = { ...current, userName: user?.name ?? null, userEmail: user?.email ?? null };
  res.json(withUser);
});

const timelineQuerySchema = z.object({
  from: z.string().trim().min(1).optional(),
  hours: z.coerce.number().int().min(1).max(24 * 90).optional(),
});

onCallRouter.get("/on-call/schedules/:id/timeline", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForSchedule), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Schedule-ID" });
    return;
  }
  const parsed = timelineQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const schedule = await getOnCallScheduleById(id);
  if (!schedule) {
    throw notFoundError("On-Call-Schedule nicht gefunden");
  }
  const from = parsed.data.from ? new Date(parsed.data.from) : new Date();
  if (Number.isNaN(from.getTime())) {
    res.status(400).json({ error: "Ungueltiges from-Datum" });
    return;
  }
  const hours = parsed.data.hours ?? 24 * 14;
  const to = new Date(from.getTime() + hours * 60 * 60 * 1000);
  const [members, overrides] = await Promise.all([
    listOnCallScheduleMembers(id),
    listOnCallOverridesInRange(id, from, to),
  ]);
  res.json(buildOnCallTimeline(id, schedule, members, overrides, from, to));
});

onCallRouter.get("/on-call/schedules/:id/overrides", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForSchedule), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Schedule-ID" });
    return;
  }
  const schedule = await getOnCallScheduleById(id);
  if (!schedule) {
    throw notFoundError("On-Call-Schedule nicht gefunden");
  }
  res.json(await listOnCallOverrides(id));
});

const createScheduleSchema = z
  .object({
    organizationId: z.string().trim().min(1),
    teamId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    rotationType: z.enum(ON_CALL_ROTATION_TYPES as [OnCallRotationType, ...OnCallRotationType[]]).optional(),
    shiftLengthHours: z.number().int().positive().max(8760),
    rotationStart: z.string().trim().min(1),
    enabled: z.boolean().optional(),
    // Auftragspunkt "Mass Assignment verhindern" - Teilnehmer werden hier
    // bewusst NICHT mitgeschickt, sondern ausschliesslich ueber den
    // dedizierten PUT .../members-Endpunkt gesetzt (validiert dort explizit
        // gegen team_members, siehe unten) - ein Client kann sie also nicht
    // beim Erstellen "huckepack" mitgeben.
  })
  .strict();

onCallRouter.post("/on-call/schedules", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdFromBody), async (req, res) => {
  const parsed = createScheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const organization = await getOrganizationById(parsed.data.organizationId);
  if (!organization) {
    res.status(404).json({ error: "Organisation nicht gefunden" });
    return;
  }
  const team = await getTeamById(parsed.data.teamId);
  if (!team || team.organizationId !== parsed.data.organizationId) {
    res.status(404).json({ error: "Team nicht gefunden" });
    return;
  }
  const rotationStart = new Date(parsed.data.rotationStart);
  if (Number.isNaN(rotationStart.getTime())) {
    res.status(400).json({ error: "Ungueltiges rotationStart-Datum" });
    return;
  }

  const limits = getPlanLimits(organization.plan);
  const { organizationId, teamId, name, description, timezone, rotationType, shiftLengthHours, enabled } = parsed.data;
  const schedule = await createOnCallScheduleIfUnderQuota(
    {
      organizationId,
      teamId,
      name,
      ...(description !== undefined ? { description } : {}),
      ...(timezone !== undefined ? { timezone } : {}),
      ...(rotationType !== undefined ? { rotationType } : {}),
      shiftLengthHours,
      rotationStart: rotationStart.toISOString(),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(req.userId ? { createdBy: req.userId } : {}),
    },
    limits.onCallSchedulesPerOrganization,
  );
  if (!schedule) {
    throw new AppError(409, "CONFLICT", `Plan-Limit erreicht: maximal ${limits.onCallSchedulesPerOrganization} On-Call-Schedules fuer den Plan ${organization.plan}`);
  }
  broadcast(createEvent(RealtimeEventType.ON_CALL_SCHEDULE_CREATED, schedule));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "ON_CALL_SCHEDULE_CREATED",
    category: "ON_CALL",
    message: `On-Call-Schedule "${schedule.name}" erstellt`,
    metadata: { scheduleId: schedule.id, organizationId: schedule.organizationId, teamId: schedule.teamId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(schedule);
});

const updateScheduleSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    rotationType: z.enum(ON_CALL_ROTATION_TYPES as [OnCallRotationType, ...OnCallRotationType[]]).optional(),
    shiftLengthHours: z.number().int().positive().max(8760).optional(),
    rotationStart: z.string().trim().min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

onCallRouter.patch("/on-call/schedules/:id", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForSchedule), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Schedule-ID" });
    return;
  }
  const parsed = updateScheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const existing = await getOnCallScheduleById(id);
  if (!existing) {
    throw notFoundError("On-Call-Schedule nicht gefunden");
  }
  let rotationStartIso: string | undefined;
  if (parsed.data.rotationStart !== undefined) {
    const rotationStart = new Date(parsed.data.rotationStart);
    if (Number.isNaN(rotationStart.getTime())) {
      res.status(400).json({ error: "Ungueltiges rotationStart-Datum" });
      return;
    }
    rotationStartIso = rotationStart.toISOString();
  }
  const { name, description, timezone, rotationType, shiftLengthHours, enabled } = parsed.data;
  const updated = await updateOnCallSchedule(id, {
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(timezone !== undefined ? { timezone } : {}),
    ...(rotationType !== undefined ? { rotationType } : {}),
    ...(shiftLengthHours !== undefined ? { shiftLengthHours } : {}),
    ...(rotationStartIso !== undefined ? { rotationStart: rotationStartIso } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
  });
  if (!updated) {
    throw notFoundError("On-Call-Schedule nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.ON_CALL_SCHEDULE_UPDATED, updated));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "ON_CALL_SCHEDULE_UPDATED",
    category: "ON_CALL",
    message: `On-Call-Schedule "${updated.name}" aktualisiert`,
    metadata: { scheduleId: updated.id, organizationId: updated.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

onCallRouter.delete("/on-call/schedules/:id", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForSchedule), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Schedule-ID" });
    return;
  }
  const existing = await getOnCallScheduleById(id);
  if (!existing) {
    throw notFoundError("On-Call-Schedule nicht gefunden");
  }
  await deleteOnCallSchedule(id);
  broadcast(createEvent(RealtimeEventType.ON_CALL_SCHEDULE_DELETED, { id: existing.id, organizationId: existing.organizationId, name: existing.name }));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "ON_CALL_SCHEDULE_DELETED",
    category: "ON_CALL",
    message: `On-Call-Schedule "${existing.name}" geloescht`,
    metadata: { scheduleId: existing.id, organizationId: existing.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Members (geordnete Rotationsliste - immer komplett ersetzt, siehe
// db/on-call.repository.ts#replaceOnCallScheduleMembers)
// ---------------------------------------------------------------------------

const replaceMembersSchema = z
  .object({
    userIds: z.array(z.string().trim().min(1)).max(50),
  })
  .strict();

onCallRouter.put("/on-call/schedules/:id/members", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForSchedule), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Schedule-ID" });
    return;
  }
  const parsed = replaceMembersSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const schedule = await getOnCallScheduleById(id);
  if (!schedule) {
    throw notFoundError("On-Call-Schedule nicht gefunden");
  }
  const uniqueUserIds = [...new Set(parsed.data.userIds)];
  if (uniqueUserIds.length !== parsed.data.userIds.length) {
    res.status(400).json({ error: "Doppelte userIds sind nicht erlaubt" });
    return;
  }
  // Auftragspunkt "Tenant-/Team-Isolation" - Rotationsteilnehmer duerfen nur
  // tatsaechliche Mitglieder GENAU des Teams sein, dem das Schedule gehoert
  // (team_members bleibt die alleinige Quelle, siehe Migrationskommentar) -
  // sonst koennte ein Aufrufer beliebige fremde user_ids "huckepack" in die
  // Rotation aufnehmen.
  if (uniqueUserIds.length > 0) {
    const teamMembers = await listTeamMembers(schedule.teamId);
    const teamMemberIds = new Set(teamMembers.map((m) => m.userId));
    const invalid = uniqueUserIds.filter((userId) => !teamMemberIds.has(userId));
    if (invalid.length > 0) {
      res.status(400).json({ error: "Nur Mitglieder des Teams koennen Teil der Rotation sein", details: { invalidUserIds: invalid } });
      return;
    }
  }

  const members = await replaceOnCallScheduleMembers(id, uniqueUserIds);
  broadcast(createEvent(RealtimeEventType.ON_CALL_SCHEDULE_UPDATED, schedule));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "ON_CALL_SCHEDULE_MEMBERS_UPDATED",
    category: "ON_CALL",
    message: `Rotationsliste fuer "${schedule.name}" aktualisiert (${members.length} Teilnehmer)`,
    metadata: { scheduleId: schedule.id, organizationId: schedule.organizationId, memberCount: members.length },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(members);
});

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

const createOverrideSchema = z
  .object({
    userId: z.string().trim().min(1),
    startsAt: z.string().trim().min(1),
    endsAt: z.string().trim().min(1),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

onCallRouter.post("/on-call/schedules/:id/overrides", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForSchedule), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Schedule-ID" });
    return;
  }
  const parsed = createOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const schedule = await getOnCallScheduleById(id);
  if (!schedule) {
    throw notFoundError("On-Call-Schedule nicht gefunden");
  }
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    res.status(400).json({ error: "Ungueltiges Datum" });
    return;
  }
  if (endsAt <= startsAt) {
    res.status(400).json({ error: "endsAt muss nach startsAt liegen" });
    return;
  }
  // Derselbe Tenant-Isolationsgrundsatz wie beim Ersetzen der Rotationsliste
  // oben - ein Override darf nur an ein tatsaechliches Teammitglied gehen.
  const teamMembers = await listTeamMembers(schedule.teamId);
  if (!teamMembers.some((m) => m.userId === parsed.data.userId)) {
    res.status(400).json({ error: "Nur Mitglieder des Teams koennen einen Override uebernehmen" });
    return;
  }

  const override = await createOverrideIfNoOverlap({
    scheduleId: id,
    userId: parsed.data.userId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
    ...(req.userId ? { createdBy: req.userId } : {}),
  });
  if (!override) {
    throw new AppError(409, "CONFLICT", "Dieser Zeitraum ueberschneidet sich mit einem bestehenden Override fuer dieses Schedule");
  }
  broadcast(createEvent(RealtimeEventType.ON_CALL_OVERRIDE_CREATED, override));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "ON_CALL_OVERRIDE_CREATED",
    category: "ON_CALL",
    message: `Override fuer "${schedule.name}" erstellt`,
    metadata: { overrideId: override.id, scheduleId: schedule.id, organizationId: schedule.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(override);
});

onCallRouter.delete(
  "/on-call/schedules/:id/overrides/:overrideId",
  authenticate,
  authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForSchedule),
  async (req, res) => {
    const scheduleId = Number(req.params.id);
    const overrideId = Number(req.params.overrideId);
    if (!Number.isInteger(scheduleId) || !Number.isInteger(overrideId)) {
      res.status(400).json({ error: "Ungueltige ID" });
      return;
    }
    const schedule = await getOnCallScheduleById(scheduleId);
    if (!schedule) {
      throw notFoundError("On-Call-Schedule nicht gefunden");
    }
    const override = await getOnCallOverrideById(overrideId);
    if (!override || override.scheduleId !== scheduleId) {
      throw notFoundError("Override nicht gefunden");
    }
    await deleteOnCallOverride(overrideId);
    broadcast(createEvent(RealtimeEventType.ON_CALL_OVERRIDE_DELETED, { id: override.id, scheduleId, organizationId: schedule.organizationId }));
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "ON_CALL_OVERRIDE_DELETED",
      category: "ON_CALL",
      message: `Override #${override.id} fuer "${schedule.name}" geloescht`,
      metadata: { overrideId: override.id, scheduleId, organizationId: schedule.organizationId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(204).end();
  },
);
