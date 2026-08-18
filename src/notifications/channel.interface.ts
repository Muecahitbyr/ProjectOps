import type { NotificationPayload } from "./notification.types";

export type NotificationStatus = "SENT" | "FAILED" | "PENDING";

export interface NotificationResult {
  channel: string;
  status: NotificationStatus;
  error?: string;
}

export interface NotificationChannel {
  readonly name: string;
  send(payload: NotificationPayload): Promise<NotificationResult>;
}
