import { apiClient } from "./client";
import type { NotificationChannel, UpsertNotificationSettingInput, UserNotificationSetting } from "../types/notification-settings.types";

export async function fetchNotificationChannels(): Promise<NotificationChannel[]> {
  const { data } = await apiClient.get<NotificationChannel[]>("/api/notification-channels");
  return data;
}

export async function fetchNotificationSettings(userId: string): Promise<UserNotificationSetting[]> {
  const { data } = await apiClient.get<UserNotificationSetting[]>("/api/notification-settings", {
    params: { userId },
  });
  return data;
}

export async function upsertNotificationSetting(input: UpsertNotificationSettingInput): Promise<UserNotificationSetting> {
  const { data } = await apiClient.put<UserNotificationSetting>("/api/notification-settings", input);
  return data;
}
