export type NotificationChannelId = "EMAIL" | "PUSH" | "IN_APP" | "WEBSOCKET";

export interface NotificationChannel {
  id: NotificationChannelId;
  description: string;
  enabledUserCount: number;
}

export interface UserNotificationSetting {
  id: string;
  userId: string;
  channelId: NotificationChannelId;
  enabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  severityFilter: string[];
  projectFilter: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertNotificationSettingInput {
  userId: string;
  channelId: NotificationChannelId;
  enabled?: boolean;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  severityFilter?: string[];
  projectFilter?: string[];
}
