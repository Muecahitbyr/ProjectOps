import { Router } from "express";
import { z } from "zod";
import {
  createClientProject,
  deleteClientProject,
  getClientProjectByName,
  listClientProjects,
  updateClientProject,
} from "../db/client-projects.repository";
import { authenticate } from "../middleware/authenticate";
import { notFoundError } from "../core/app-error";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";

// "Projekte" (eigene Sidebar-Seite, Nutzerwunsch 2026-10-06) - dieselbe
// "Shared Ops Console"-Konvention wie /todos, /nisan-guests, /acquisition-
// companies: kein projektbezogenes RBAC, jeder angemeldete Nutzer dieses
// internen Einzelbetreiber-Tools sieht/verwaltet alle Eintraege.
export const clientProjectsRouter = Router();

function parseClientProjectId(req: import("express").Request): number | undefined {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : undefined;
}

clientProjectsRouter.get("/client-projects", authenticate, async (_req, res) => {
  res.json(await listClientProjects());
});

const NAME = z.string().trim().min(1).max(200);
// Admin-Zugangsdaten/Notizen bewusst grosszuegig begrenzt (lange Passwort-
// Manager-Strings, mehrzeilige Notizen) statt eng wie z.B. Todo-Titel.
const OPTIONAL_TEXT = z.string().trim().max(2000).nullable().optional();

const createSchema = z
  .object({
    name: NAME,
    adminLoginUrl: OPTIONAL_TEXT,
    adminLoginUsername: OPTIONAL_TEXT,
    adminLoginPassword: OPTIONAL_TEXT,
    notes: z.string().trim().max(10_000).nullable().optional(),
  })
  .strict();

clientProjectsRouter.post("/client-projects", authenticate, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  // Pre-Check statt eines rohen Postgres-Unique-Violation-Fehlers (23505) -
  // dieselbe Konvention wie der services.project_id-Pre-Check in
  // platform-services.routes.ts.
  if (await getClientProjectByName(parsed.data.name)) {
    res.status(409).json({ error: "Ein Projekt mit diesem Namen existiert bereits" });
    return;
  }
  const project = await createClientProject(parsed.data);
  broadcast(createEvent(RealtimeEventType.CLIENT_PROJECT_UPDATED, project));
  res.status(201).json(project);
});

const updateSchema = z
  .object({
    name: NAME.optional(),
    adminLoginUrl: OPTIONAL_TEXT,
    adminLoginUsername: OPTIONAL_TEXT,
    adminLoginPassword: OPTIONAL_TEXT,
    notes: z.string().trim().max(10_000).nullable().optional(),
  })
  .strict();

clientProjectsRouter.patch("/client-projects/:id", authenticate, async (req, res) => {
  const id = parseClientProjectId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Projekt-ID" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.name !== undefined) {
    const existing = await getClientProjectByName(parsed.data.name);
    if (existing && existing.id !== id) {
      res.status(409).json({ error: "Ein Projekt mit diesem Namen existiert bereits" });
      return;
    }
  }
  const project = await updateClientProject(id, parsed.data);
  if (!project) {
    throw notFoundError("Projekt nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.CLIENT_PROJECT_UPDATED, project));
  res.json(project);
});

clientProjectsRouter.delete("/client-projects/:id", authenticate, async (req, res) => {
  const id = parseClientProjectId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Projekt-ID" });
    return;
  }
  const project = await deleteClientProject(id);
  if (!project) {
    throw notFoundError("Projekt nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.CLIENT_PROJECT_UPDATED, project));
  res.status(204).end();
});
