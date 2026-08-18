import { Router } from "express";
import { getOnCallScheduleById, listOnCallSchedules, listOnCallScheduleMembers, listOnCallOverridesInRange } from "../../db/on-call.repository";
import { resolveCurrentOnCall } from "../../core/on-call";
import { getUserById } from "../../db/users.repository";
import type { OnCallSchedule, CurrentOnCallWithUser } from "../../types/on-call.types";
import { authenticateApiKey, apiKeyRateLimiter, enforceApiQuota, requireApiScope, trackApiUsage } from "../../middleware/api-key-auth";
import { paginatedResponse, parsePagination } from "./shared";
import { notFoundError } from "../../core/app-error";

// Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" Auftragspunkt
// "Externe API" - bewusst NUR lesend (siehe types/api-scope.types.ts#on_call:read):
// deckt den realen ChatOps-/Integrations-Anwendungsfall "wer ist gerade fuer
// Team X dran?" ab, analog zu routes/v1/services.routes.ts (Phase 23, dort
// ebenfalls ausschliesslich GET). Schedule-Verwaltung bleibt der internen,
// Session-authentifizierten Oberflaeche vorbehalten.
export const v1OnCallRouter = Router();

async function assertScheduleVisible(scheduleId: number, organizationId: string, teamId: string | null): Promise<OnCallSchedule> {
  const schedule = await getOnCallScheduleById(scheduleId);
  if (!schedule || schedule.organizationId !== organizationId) {
    throw notFoundError("On-Call-Schedule nicht gefunden");
  }
  if (teamId && schedule.teamId !== teamId) {
    throw notFoundError("On-Call-Schedule nicht gefunden");
  }
  return schedule;
}

v1OnCallRouter.get(
  "/v1/on-call/schedules",
  authenticateApiKey,
  requireApiScope("on_call:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const pagination = parsePagination(req);
    const all = await listOnCallSchedules({ organizationId: context.organizationId, ...(context.teamId ? { teamId: context.teamId } : {}) });
    const page = all.slice(pagination.offset, pagination.offset + pagination.pageSize);
    res.json(paginatedResponse(page, pagination, all.length));
  },
);

v1OnCallRouter.get(
  "/v1/on-call/schedules/:id",
  authenticateApiKey,
  requireApiScope("on_call:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Schedule-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const schedule = await assertScheduleVisible(id, context.organizationId, context.teamId);
    res.json({ data: schedule });
  },
);

v1OnCallRouter.get(
  "/v1/on-call/schedules/:id/current",
  authenticateApiKey,
  requireApiScope("on_call:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Schedule-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const schedule = await assertScheduleVisible(id, context.organizationId, context.teamId);
    const now = new Date();
    const [members, overrides] = await Promise.all([
      listOnCallScheduleMembers(schedule.id),
      listOnCallOverridesInRange(schedule.id, now, now),
    ]);
    const current = resolveCurrentOnCall(schedule.id, schedule, members, overrides, now);
    const user = current.userId ? await getUserById(current.userId) : undefined;
    const withUser: CurrentOnCallWithUser = { ...current, userName: user?.name ?? null, userEmail: user?.email ?? null };
    res.json({ data: withUser });
  },
);
