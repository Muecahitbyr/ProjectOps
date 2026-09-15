import { Router } from "express";
import { z } from "zod";
import { createNisanGuest, deleteNisanGuest, listNisanGuests, updateNisanGuest } from "../db/nisan.repository";
import { authenticate } from "../middleware/authenticate";
import { notFoundError } from "../core/app-error";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";

// Nisan-Gaesteliste (Verlobung), eigene Sidebar-Seite (Nutzerwunsch) -
// dieselbe "Shared Ops Console"-Konvention wie /todos und /acquisition-
// companies: kein projektbezogenes RBAC, jeder angemeldete Nutzer dieses
// internen Einzelbetreiber-Tools sieht/verwaltet alle Eintraege.
export const nisanRouter = Router();

function parseGuestId(req: import("express").Request): number | undefined {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : undefined;
}

nisanRouter.get("/nisan-guests", authenticate, async (_req, res) => {
  res.json(await listNisanGuests());
});

const createSchema = z
  .object({
    host: z.enum(["MUECAHIT", "GOENUEL"]),
    name: z.string().trim().min(1).max(200),
    status: z.enum(["CONFIRMED", "MAYBE"]).optional(),
  })
  .strict();

nisanRouter.post("/nisan-guests", authenticate, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const guest = await createNisanGuest(parsed.data);
  broadcast(createEvent(RealtimeEventType.NISAN_GUEST_UPDATED, guest));
  res.status(201).json(guest);
});

const updateSchema = z
  .object({
    status: z.enum(["CONFIRMED", "MAYBE"]),
  })
  .strict();

nisanRouter.patch("/nisan-guests/:id", authenticate, async (req, res) => {
  const id = parseGuestId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Gast-ID" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const guest = await updateNisanGuest(id, parsed.data);
  if (!guest) {
    throw notFoundError("Gast nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.NISAN_GUEST_UPDATED, guest));
  res.json(guest);
});

nisanRouter.delete("/nisan-guests/:id", authenticate, async (req, res) => {
  const id = parseGuestId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Gast-ID" });
    return;
  }
  const guest = await deleteNisanGuest(id);
  if (!guest) {
    throw notFoundError("Gast nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.NISAN_GUEST_UPDATED, guest));
  res.status(204).end();
});
