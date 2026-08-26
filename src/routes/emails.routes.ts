import { Router } from "express";
import { z } from "zod";
import { listEmails, markEmailRead } from "../db/emails.repository";
import { authenticate } from "../middleware/authenticate";
import { notFoundError } from "../core/app-error";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";

// Postfach-Panel unter KI-Buero - reine Anzeige des per IMAP-Polling
// gefuellten Caches (core/email-sync.ts), kein Senden/Loeschen/Verschieben
// (bewusst read-only, siehe Nutzeranfrage "meine E-Mails sehen"). Dieselbe
// "Shared Ops Console"-Konvention wie /todos, /incidents etc.
export const emailsRouter = Router();

emailsRouter.get("/emails", authenticate, async (req, res) => {
  const limitRaw = req.query.limit;
  const limit = typeof limitRaw === "string" && Number.isInteger(Number(limitRaw)) ? Number(limitRaw) : 50;
  res.json(await listEmails(limit));
});

const markReadSchema = z.object({ read: z.boolean() }).strict();

emailsRouter.patch("/emails/:id/read", authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige E-Mail-ID" });
    return;
  }
  const parsed = markReadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const email = await markEmailRead(id, parsed.data.read);
  if (!email) {
    throw notFoundError("E-Mail nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.EMAIL_RECEIVED, email));
  res.json(email);
});
