import { broadcast } from "../../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../../realtime/events";
import { dispatchWebhookEvent } from "../../core/webhook-dispatch";
import type { EventChannelResult, NotificationEventChannel } from "../event-channel.interface";
import type { NotificationEvent } from "../notification-event.types";

export const websocketEventChannel: NotificationEventChannel = {
  name: "WEBSOCKET",

  async send(event: NotificationEvent): Promise<EventChannelResult> {
    broadcast(createEvent(RealtimeEventType.NOTIFICATION_EVENT, event));
    void dispatchWebhookEvent("NOTIFICATION_EVENT", event);
    return { channel: "WEBSOCKET", status: "SENT" };
  },
};
