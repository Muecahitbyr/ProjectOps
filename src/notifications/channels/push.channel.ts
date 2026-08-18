import { logger } from "../../core/logger";
import type { NotificationChannel, NotificationResult } from "../channel.interface";
import type { NotificationPayload } from "../notification.types";

// Vorbereitung fuer iPhone Push Notifications (APNs).
// Es gibt noch keine Geraete-Token-Registrierung und keine APNs-Anbindung.
// Der Payload wird ueber notification.service.ts als PENDING in der
// notifications-Tabelle abgelegt, damit ein spaeterer APNs-Worker ihn
// ausliefern kann - das Channel-Interface aendert sich dafuer nicht mehr.
export const pushChannel: NotificationChannel = {
  name: "push",

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    logger.info("Push-Benachrichtigung vorbereitet (APNs-Anbindung folgt)", {
      project: payload.projectId,
      checkId: payload.checkId,
      summary: payload.analysis.summary,
      rootCause: payload.analysis.rootCause,
      recommendation: payload.analysis.recommendation,
    });
    return { channel: "push", status: "PENDING", error: "APNs-Anbindung noch nicht implementiert" };
  },
};
