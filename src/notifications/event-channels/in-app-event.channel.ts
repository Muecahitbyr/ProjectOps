import type { EventChannelResult, NotificationEventChannel } from "../event-channel.interface";
import type { NotificationEvent } from "../notification-event.types";

// "Zustellung" bedeutet hier: der Event wird in notification_events
// gespeichert (siehe notification-event.service.ts) und vom Frontend ueber
// GET /api/notification-events abgerufen (Notification Center) - es gibt
// keinen externen Versandschritt, daher immer SENT.
export const inAppEventChannel: NotificationEventChannel = {
  name: "IN_APP",

  async send(_event: NotificationEvent): Promise<EventChannelResult> {
    return { channel: "IN_APP", status: "SENT" };
  },
};
