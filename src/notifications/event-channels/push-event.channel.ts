import { logger } from "../../core/logger";
import type { EventChannelResult, NotificationEventChannel } from "../event-channel.interface";
import type { NotificationEvent } from "../notification-event.types";

// Analog zu channels/push.channel.ts: keine Geraete-Token-Registrierung/APNs-
// Anbindung in diesem Projekt vorhanden - der Event wird als PENDING erfasst,
// damit ein spaeterer APNs-Worker ihn ausliefern kann, ohne dass sich das
// Channel-Interface dafuer noch einmal aendert.
export const pushEventChannel: NotificationEventChannel = {
  name: "PUSH",

  async send(event: NotificationEvent): Promise<EventChannelResult> {
    logger.info("Push-Event vorbereitet (APNs-Anbindung folgt)", {
      project: event.projectId,
      type: event.type,
      title: event.title,
    });
    return { channel: "PUSH", status: "PENDING", error: "APNs-Anbindung noch nicht implementiert" };
  },
};
