import { Router } from "express";
import { z } from "zod";
import { createJobApplication, deleteJobApplication, listJobApplications, updateJobApplication } from "../db/job-application.repository";
import { authenticate } from "../middleware/authenticate";
import { notFoundError } from "../core/app-error";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";

// "Bewerbungen", eigene Sidebar-Seite (Nutzerwunsch) - dieselbe "Shared Ops
// Console"-Konvention wie /todos, /acquisition-companies und /nisan-guests:
// kein projektbezogenes RBAC, jeder angemeldete Nutzer dieses internen
// Einzelbetreiber-Tools sieht/verwaltet alle Eintraege.
export const jobApplicationRouter = Router();

function parseApplicationId(req: import("express").Request): number | undefined {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : undefined;
}

jobApplicationRouter.get("/job-applications", authenticate, async (_req, res) => {
  res.json(await listJobApplications());
});

const nullableString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : (value ?? undefined)));

const createSchema = z
  .object({
    company: z.string().trim().min(1).max(200),
    position: nullableString(300),
    appliedAt: z.string().date().nullable().optional(),
    location: nullableString(200),
    interviewNote: nullableString(2000),
    status: z.enum(["OFFEN", "ABSAGE", "ZUSAGE"]).optional(),
    notes: nullableString(2000),
  })
  .strict();

jobApplicationRouter.post("/job-applications", authenticate, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const application = await createJobApplication(parsed.data);
  broadcast(createEvent(RealtimeEventType.JOB_APPLICATION_UPDATED, application));
  res.status(201).json(application);
});

const updateSchema = z
  .object({
    company: z.string().trim().min(1).max(200).optional(),
    position: nullableString(300),
    appliedAt: z.string().date().nullable().optional(),
    location: nullableString(200),
    interviewNote: nullableString(2000),
    status: z.enum(["OFFEN", "ABSAGE", "ZUSAGE"]).optional(),
    notes: nullableString(2000),
  })
  .strict();

jobApplicationRouter.patch("/job-applications/:id", authenticate, async (req, res) => {
  const id = parseApplicationId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Bewerbungs-ID" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const application = await updateJobApplication(id, parsed.data);
  if (!application) {
    throw notFoundError("Bewerbung nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.JOB_APPLICATION_UPDATED, application));
  res.json(application);
});

jobApplicationRouter.delete("/job-applications/:id", authenticate, async (req, res) => {
  const id = parseApplicationId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Bewerbungs-ID" });
    return;
  }
  const application = await deleteJobApplication(id);
  if (!application) {
    throw notFoundError("Bewerbung nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.JOB_APPLICATION_UPDATED, application));
  res.status(204).end();
});
