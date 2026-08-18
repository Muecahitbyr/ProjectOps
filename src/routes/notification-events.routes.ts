import { Router } from "express";
import { z } from "zod";
import { listNotificationEvents } from "../db/notification-events.repository";
import { authenticate } from "../middleware/authenticate";

export const notificationEventsRouter = Router();

const querySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).catch(50),
});

// Auftragspunkt 3 "Notification Infrastructure" - liefert die IN_APP-Eintraege
// fuer das Notification Center im Frontend (siehe db/notification-events.repository.ts).
notificationEventsRouter.get("/notification-events", authenticate, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }

  const { projectId, limit } = parsed.data;
  res.json(await listNotificationEvents({ ...(projectId ? { projectId } : {}), limit }));
});
