import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchNotificationChannels, fetchNotificationSettings, upsertNotificationSetting } from "../api/notification-settings.api";
import { queryKeys } from "./queryKeys";
import type { UpsertNotificationSettingInput } from "../types/notification-settings.types";

export function useNotificationChannels() {
  return useQuery({
    queryKey: queryKeys.notificationChannels,
    queryFn: fetchNotificationChannels,
  });
}

export function useNotificationSettings(userId: string) {
  return useQuery({
    queryKey: queryKeys.notificationSettings(userId),
    queryFn: () => fetchNotificationSettings(userId),
    enabled: userId.length > 0,
  });
}

export function useUpsertNotificationSetting(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertNotificationSettingInput) => upsertNotificationSetting(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationSettings(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationChannels });
    },
  });
}
