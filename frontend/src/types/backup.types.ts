import type { AlertRule } from "./alert.types";
import type { AutomationRule } from "./automation.types";
import type { MaintenanceWindow } from "./maintenance.types";
import type { UserNotificationSetting } from "./notification-settings.types";

// Spiegelt src/types/backup.types.ts im Backend.
export interface SystemBackupData {
  capturedAt: string;
  users: Array<{ id: string; name: string; email: string; avatar: string | null }>;
  alertRules: AlertRule[];
  notificationSettings: UserNotificationSetting[];
  automationRules: AutomationRule[];
  maintenanceWindows: MaintenanceWindow[];
  analyticsSettings: Record<string, never>;
}

export interface SystemBackup {
  id: string;
  createdBy: string | null;
  label: string;
  data: SystemBackupData;
  restoredAt: string | null;
  restoredBy: string | null;
  createdAt: string;
}

export interface RestoreSummary {
  alertRulesRestored: number;
  automationRulesRestored: number;
  maintenanceWindowsRestored: number;
  notificationSettingsRestored: number;
}
