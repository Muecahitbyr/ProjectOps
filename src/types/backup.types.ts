import type { AlertRule } from "./alert.types";
import type { AutomationRule } from "./automation.types";
import type { MaintenanceWindow } from "./maintenance.types";
import type { UserNotificationSetting } from "./notification-settings.types";

export interface SystemBackupData {
  capturedAt: string;
  users: Array<{ id: string; name: string; email: string; avatar: string | null }>;
  alertRules: AlertRule[];
  notificationSettings: UserNotificationSetting[];
  automationRules: AutomationRule[];
  maintenanceWindows: MaintenanceWindow[];
  // Kein eigenstaendiges "Analytics Settings"-Feature in ProjectOps
  // (Analytics ist vollstaendig aus Rohdaten berechnet, keine gespeicherte
  // Konfiguration) - bleibt ehrlich leer statt erfundene Werte zu zeigen.
  analyticsSettings: Record<string, never>;
}

export interface SystemBackup {
  id: number;
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
