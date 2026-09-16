import { Router } from "express";
import { z } from "zod";
import {
  createAcquisitionCompany,
  createContactAttempt,
  deleteAcquisitionCompany,
  listAcquisitionCompanies,
  listContactAttempts,
  updateAcquisitionCompany,
} from "../db/acquisition.repository";
import { authenticate } from "../middleware/authenticate";
import { notFoundError } from "../core/app-error";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";

// Akquise-Pipeline, eigene Sidebar-Seite (Nutzerwunsch) - dieselbe "Shared
// Ops Console"-Konvention wie /todos: kein projektbezogenes RBAC, jeder
// angemeldete Nutzer dieses internen Einzelbetreiber-Tools sieht/verwaltet
// alle Eintraege.
export const acquisitionRouter = Router();

function parseCompanyId(req: import("express").Request): number | undefined {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : undefined;
}

acquisitionRouter.get("/acquisition-companies", authenticate, async (_req, res) => {
  res.json(await listAcquisitionCompanies());
});

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(1).max(50).optional(),
    email: z.string().trim().min(1).max(200).optional(),
    websiteUrl: z.string().trim().min(1).max(500).optional(),
    category: z.string().trim().min(1).max(200).optional(),
    address: z.string().trim().min(1).max(500).optional(),
    openingHours: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

acquisitionRouter.post("/acquisition-companies", authenticate, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const company = await createAcquisitionCompany(parsed.data);
  broadcast(createEvent(RealtimeEventType.ACQUISITION_COMPANY_UPDATED, company));
  res.status(201).json(company);
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    websiteBuilt: z.boolean().optional(),
    called: z.boolean().optional(),
    wantsWebsite: z.boolean().nullable().optional(),
    websiteSent: z.boolean().optional(),
    confirmedAfterViewing: z.boolean().nullable().optional(),
    planningDone: z.boolean().optional(),
    implementationDone: z.boolean().optional(),
    live: z.boolean().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    email: z.string().trim().max(200).nullable().optional(),
    websiteUrl: z.string().trim().max(500).nullable().optional(),
    category: z.string().trim().max(200).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

acquisitionRouter.patch("/acquisition-companies/:id", authenticate, async (req, res) => {
  const id = parseCompanyId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Unternehmens-ID" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const company = await updateAcquisitionCompany(id, parsed.data);
  if (!company) {
    throw notFoundError("Unternehmen nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.ACQUISITION_COMPANY_UPDATED, company));
  res.json(company);
});

acquisitionRouter.delete("/acquisition-companies/:id", authenticate, async (req, res) => {
  const id = parseCompanyId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Unternehmens-ID" });
    return;
  }
  const company = await deleteAcquisitionCompany(id);
  if (!company) {
    throw notFoundError("Unternehmen nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.ACQUISITION_COMPANY_UPDATED, company));
  res.status(204).end();
});

const contactAttemptSchema = z
  .object({
    outcome: z.enum(["NOT_REACHED", "SPOKE_TO_STAFF", "SPOKE_TO_OWNER", "CALLBACK_REQUESTED", "OTHER"]),
    note: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

acquisitionRouter.get("/acquisition-companies/:id/contact-attempts", authenticate, async (req, res) => {
  const id = parseCompanyId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Unternehmens-ID" });
    return;
  }
  res.json(await listContactAttempts(id));
});

acquisitionRouter.post("/acquisition-companies/:id/contact-attempts", authenticate, async (req, res) => {
  const id = parseCompanyId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Unternehmens-ID" });
    return;
  }
  const parsed = contactAttemptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const attempt = await createContactAttempt(id, parsed.data);
  res.status(201).json(attempt);
});
