import { Router } from "express";
import { z } from "zod";
import { monitorService } from "../core/monitor";
import { getProjectStatus } from "../db/projects.repository";
import { addProjectMember, getMembersForProject, getUserById, removeProjectMember } from "../db/users.repository";
import { authenticate } from "../middleware/authenticate";
import { authorizeProjectAccess, authorizeRole } from "../middleware/authorize";
import type { RoleId } from "../types/user.types";

export const projectsRouter = Router();

const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

const addMemberSchema = z.object({
  userId: z.string().trim().min(1),
  roleId: z.enum(["OWNER", "ADMIN", "DEVELOPER", "VIEWER"]),
});

function resolveProjectIdFromParam(req: import("express").Request): string | undefined {
  return typeof req.params.id === "string" ? req.params.id : undefined;
}

projectsRouter.get("/projects", authenticate, (_req, res) => {
  res.json(monitorService.getProjects());
});

projectsRouter.get("/projects/:id", authenticate, authorizeProjectAccess(resolveProjectIdFromParam), (req, res) => {
  const project = monitorService.getProject(req.params.id as string);

  if (!project) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  res.json(project);
});

projectsRouter.get(
  "/projects/:id/status",
  authenticate,
  authorizeProjectAccess(resolveProjectIdFromParam),
  async (req, res) => {
    const status = await getProjectStatus(req.params.id as string);

    if (!status) {
      res.status(404).json({ error: "Projekt nicht gefunden" });
      return;
    }

    res.json(status);
  },
);

projectsRouter.get(
  "/projects/:id/members",
  authenticate,
  authorizeProjectAccess(resolveProjectIdFromParam),
  async (req, res) => {
    const members = await getMembersForProject(req.params.id as string);
    res.json(members);
  },
);

projectsRouter.post(
  "/projects/:id/members",
  authenticate,
  authorizeRole(MANAGE_ROLES, resolveProjectIdFromParam),
  async (req, res) => {
    const projectId = req.params.id as string;
    if (!monitorService.getProject(projectId)) {
      res.status(404).json({ error: "Projekt nicht gefunden" });
      return;
    }

    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
      return;
    }

    const user = await getUserById(parsed.data.userId);
    if (!user) {
      res.status(404).json({ error: "Benutzer nicht gefunden" });
      return;
    }

    const member = await addProjectMember({ projectId, userId: parsed.data.userId, roleId: parsed.data.roleId });
    res.status(201).json({ ...member, user });
  },
);

projectsRouter.delete(
  "/projects/:id/members/:userId",
  authenticate,
  authorizeRole(MANAGE_ROLES, resolveProjectIdFromParam),
  async (req, res) => {
    const removed = await removeProjectMember(req.params.id as string, req.params.userId as string);
    if (!removed) {
      res.status(404).json({ error: "Mitgliedschaft nicht gefunden" });
      return;
    }
    res.status(204).end();
  },
);
