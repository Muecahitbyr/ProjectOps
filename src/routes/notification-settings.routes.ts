import { Router } from "express";
import { z } from "zod";
import {
  getNotificationSettingsForUser,
  listNotificationChannels,
  upsertNotificationSetting,
} from "../db/notification-settings.repository";
import { getUserById, isGlobalAdmin } from "../db/users.repository";
import { authenticate } from "../middleware/authenticate";
import { forbiddenError } from "../core/app-error";

export const notificationSettingsRouter = Router();

const upsertSchema = z.object({
  userId: z.string().trim().min(1),
  channelId: z.enum(["EMAIL", "PUSH", "IN_APP", "WEBSOCKET"]),
  enabled: z.boolean().optional(),
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  severityFilter: z.array(z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])).optional(),
  projectFilter: z.array(z.string()).optional(),
});

notificationSettingsRouter.get("/notification-channels", authenticate, async (_req, res) => {
  res.json(await listNotificationChannels());
});

// Phase 65 "Enterprise Platform Consolidation & Final Gap Analysis" - live
// gefundenes IDOR: dieselbe Pruefung wie beim PUT unten (Zeile 37-40 dort)
// fehlte hier auf der Lese-Seite - jeder authentifizierte Nutzer konnte
// bislang die Benachrichtigungseinstellungen (Quiet Hours, Severity-/
// Projekt-Filter) eines BELIEBIGEN anderen userId auslesen.
notificationSettingsRouter.get("/notification-settings", authenticate, async (req, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  if (!userId) {
    res.status(400).json({ error: "userId ist erforderlich" });
    return;
  }
  if (req.userId !== userId && !(await isGlobalAdmin(req.userId as string))) {
    throw forbiddenError("Nur eigene Benachrichtigungseinstellungen duerfen gelesen werden");
  }
  res.json(await getNotificationSettingsForUser(userId));
});

// Nur die eigenen Benachrichtigungseinstellungen (oder als globaler Admin
// die eines anderen Nutzers) duerfen geaendert werden - ohne diese Pruefung
// koennte jeder authentifizierte Nutzer die Einstellungen eines beliebigen
// anderen userId ueberschreiben.
notificationSettingsRouter.put("/notification-settings", authenticate, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  if (req.userId !== parsed.data.userId && !(await isGlobalAdmin(req.userId as string))) {
    throw forbiddenError("Nur eigene Benachrichtigungseinstellungen duerfen geaendert werden");
  }

  const user = await getUserById(parsed.data.userId);
  if (!user) {
    res.status(404).json({ error: "Benutzer nicht gefunden" });
    return;
  }

  const { userId, channelId, enabled, quietHoursStart, quietHoursEnd, severityFilter, projectFilter } = parsed.data;
  const setting = await upsertNotificationSetting({
    userId,
    channelId,
    ...(enabled !== undefined ? { enabled } : {}),
    ...(quietHoursStart !== undefined ? { quietHoursStart } : {}),
    ...(quietHoursEnd !== undefined ? { quietHoursEnd } : {}),
    ...(severityFilter !== undefined ? { severityFilter } : {}),
    ...(projectFilter !== undefined ? { projectFilter } : {}),
  });
  res.json(setting);
});
