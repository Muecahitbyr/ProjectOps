import { Router } from "express";
import { z } from "zod";
import {
  addProjectToTeam,
  addTeamMember,
  createTeam,
  deleteTeam,
  getTeamById,
  listProjectIdsForTeam,
  listTeamMembers,
  listTeamNotificationSettings,
  listTeams,
  removeProjectFromTeam,
  removeTeamMember,
  updateTeam,
  upsertTeamNotificationSetting,
} from "../db/teams.repository";
import { authenticate } from "../middleware/authenticate";
import { authorizeOrganizationMembership, authorizeOrganizationRole } from "../middleware/authorize";
import { notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import type { OrganizationRoleId } from "../types/organization.types";
import type { Request } from "express";

// Phase 15 Teil 3 "Teams".
export const teamsRouter = Router();

const MANAGE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN"];
const ORG_ROLE_VALUES: OrganizationRoleId[] = [
  "PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "SECURITY_ADMIN",
  "BILLING_ADMIN", "DEVELOPER", "OPERATOR", "VIEWER", "SERVICE_ACCOUNT",
];

async function resolveOrgIdFromQuery(req: Request): Promise<string | undefined> {
  return typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
}

async function resolveOrgIdFromBody(req: Request): Promise<string | undefined> {
  return typeof req.body?.organizationId === "string" ? req.body.organizationId : undefined;
}

async function resolveOrgIdFromTeamParam(req: Request): Promise<string | undefined> {
  const team = await getTeamById(req.params.id as string);
  return team?.organizationId;
}

teamsRouter.get("/teams", authenticate, authorizeOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  res.json(await listTeams(req.query.organizationId as string));
});

const createSchema = z.object({
  organizationId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
});

teamsRouter.post("/teams", authenticate, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromBody), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const { organizationId, name, description } = parsed.data;
  const team = await createTeam({ organizationId, name, ...(description !== undefined ? { description } : {}) });
  broadcast(createEvent(RealtimeEventType.TEAM_CREATED, team));
  void recordAuditLog({
    userId: req.userId!,
    action: "TEAM_CREATED",
    category: "SYSTEM",
    message: `Team "${team.name}" erstellt`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(team);
});

teamsRouter.get("/teams/:id", authenticate, authorizeOrganizationMembership(resolveOrgIdFromTeamParam), async (req, res) => {
  const team = await getTeamById(req.params.id as string);
  if (!team) {
    throw notFoundError("Team nicht gefunden");
  }
  res.json(team);
});

const updateSchema = z.object({ name: z.string().trim().min(1).max(200).optional(), description: z.string().trim().max(1000).optional() });

teamsRouter.patch("/teams/:id", authenticate, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromTeamParam), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const { name, description } = parsed.data;
  const updated = await updateTeam(req.params.id as string, {
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
  });
  if (!updated) {
    throw notFoundError("Team nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.TEAM_UPDATED, updated));
  res.json(updated);
});

teamsRouter.delete("/teams/:id", authenticate, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromTeamParam), async (req, res) => {
  const team = await getTeamById(req.params.id as string);
  const deleted = await deleteTeam(req.params.id as string);
  if (!deleted) {
    throw notFoundError("Team nicht gefunden");
  }
  void recordAuditLog({
    userId: req.userId!,
    action: "TEAM_DELETED",
    category: "SYSTEM",
    message: `Team "${team?.name ?? req.params.id}" geloescht`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(204).end();
});

teamsRouter.get("/teams/:id/members", authenticate, authorizeOrganizationMembership(resolveOrgIdFromTeamParam), async (req, res) => {
  res.json(await listTeamMembers(req.params.id as string));
});

const addMemberSchema = z.object({ userId: z.string().trim().min(1), roleId: z.enum(ORG_ROLE_VALUES as [OrganizationRoleId, ...OrganizationRoleId[]]) });

teamsRouter.post("/teams/:id/members", authenticate, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromTeamParam), async (req, res) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  res.status(201).json(await addTeamMember(req.params.id as string, parsed.data.userId, parsed.data.roleId));
});

teamsRouter.delete("/teams/:id/members/:userId", authenticate, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromTeamParam), async (req, res) => {
  const removed = await removeTeamMember(req.params.id as string, req.params.userId as string);
  if (!removed) {
    throw notFoundError("Mitgliedschaft nicht gefunden");
  }
  res.status(204).end();
});

teamsRouter.get("/teams/:id/projects", authenticate, authorizeOrganizationMembership(resolveOrgIdFromTeamParam), async (req, res) => {
  res.json(await listProjectIdsForTeam(req.params.id as string));
});

const addProjectSchema = z.object({ projectId: z.string().trim().min(1) });

teamsRouter.post("/teams/:id/projects", authenticate, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromTeamParam), async (req, res) => {
  const parsed = addProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  await addProjectToTeam(parsed.data.projectId, req.params.id as string);
  res.status(201).end();
});

teamsRouter.delete("/teams/:id/projects/:projectId", authenticate, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromTeamParam), async (req, res) => {
  const removed = await removeProjectFromTeam(req.params.projectId as string, req.params.id as string);
  if (!removed) {
    throw notFoundError("Zuordnung nicht gefunden");
  }
  res.status(204).end();
});

teamsRouter.get("/teams/:id/notification-settings", authenticate, authorizeOrganizationMembership(resolveOrgIdFromTeamParam), async (req, res) => {
  res.json(await listTeamNotificationSettings(req.params.id as string));
});

const notificationSettingSchema = z.object({ channelId: z.string().trim().min(1), enabled: z.boolean() });

teamsRouter.put(
  "/teams/:id/notification-settings",
  authenticate,
  authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromTeamParam),
  async (req, res) => {
    const parsed = notificationSettingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
      return;
    }
    res.json(await upsertTeamNotificationSetting(req.params.id as string, parsed.data.channelId, parsed.data.enabled));
  },
);
