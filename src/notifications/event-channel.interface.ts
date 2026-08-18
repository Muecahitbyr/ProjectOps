import type { NotificationEvent } from "./notification-event.types";

export type EventChannelName = "EMAIL" | "PUSH" | "IN_APP" | "WEBSOCKET";
export type EventChannelStatus = "SENT" | "FAILED" | "PENDING";

export interface EventChannelResult {
  channel: EventChannelName;
  status: EventChannelStatus;
  error?: string;
}

export interface NotificationEventChannel {
  readonly name: EventChannelName;
  send(event: NotificationEvent): Promise<EventChannelResult>;
}
