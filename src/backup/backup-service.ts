import { listUsers } from "../db/users.repository";
import { listAlertRules, createAlertRule } from "../db/alerts.repository";
import { listAutomationRules, createAutomationRule } from "../db/automation-rules.repository";
import { listMaintenanceWindows, createMaintenanceWindow } from "../db/maintenance.repository";
import { listAllNotificationSettings, upsertNotificationSetting } from "../db/notification-settings.repository";
import { createSystemBackup, getSystemBackupById, markSystemBackupRestored } from "../db/system-backups.repository";
import type { RestoreSummary, SystemBackup, SystemBackupData } from "../types/backup.types";
import { AppError, notFoundError } from "../core/app-error";

// Phase 13 Teil 8 "Backup Center" - kein pg_dump, kein Shell-Aufruf: der
// Snapshot besteht ausschliesslich aus bereits vorhandenen Repository-
// Funktionen (dieselbe Architektur wie automation_backups aus Phase 11).
// Passwort-Hashes sind bewusst NICHT Teil des Nutzer-Snapshots.
export async function captureSystemBackup(label: string, createdBy?: string): Promise<SystemBackup> {
  const [users, alertRules, automationRules, maintenanceWindows, notificationSettings] = await Promise.all([
    listUsers(),
    listAlertRules(),
    listAutomationRules(),
    listMaintenanceWindows(),
    listAllNotificationSettings(),
  ]);

  const data: SystemBackupData = {
    capturedAt: new Date().toISOString(),
    users: users.map((user) => ({ id: user.id, name: user.name, email: user.email, avatar: user.avatar })),
    alertRules,
    automationRules,
    maintenanceWindows,
    notificationSettings,
    analyticsSettings: {},
  };

  return createSystemBackup({ label, data, ...(createdBy !== undefined ? { createdBy } : {}) });
}

// Restore erzeugt die gesicherten Alert-/Automatisierungsregeln und
// Wartungsfenster als NEUE Zeilen (ueber dieselben create*-Funktionen wie
// eine manuelle Neuanlage) statt sie per ID zu ueberschreiben - das ist
// sicherer (keine Kollision mit zwischenzeitlich veraenderten echten Daten,
// nie destruktiv) und deckt sich mit "additive Erweiterungen, keine
// Regressionen". Benutzer werden bewusst NICHT zurueckgeschrieben (kein
// Passwort im Snapshot, ein Ueberschreiben waere riskant) - sie dienen nur
// der Sichtbarkeit im Backup-Inhalt. Benachrichtigungseinstellungen werden
// per upsert wiederhergestellt (user_id+channel_id ist bereits eindeutig,
// dort ist ein Ueberschreiben die erwartete, sichere Wiederherstellungs-
// Semantik).
export async function restoreSystemBackup(backupId: number, restoredBy: string): Promise<RestoreSummary> {
  const backup = await getSystemBackupById(backupId);
  if (!backup) {
    throw notFoundError("Backup nicht gefunden");
  }
  if (backup.restoredAt) {
    throw new AppError(409, "CONFLICT", "Dieses Backup wurde bereits wiederhergestellt");
  }

  const { data } = backup;

  for (const rule of data.alertRules) {
    await createAlertRule({
      projectId: rule.projectId,
      name: `${rule.name} (restored)`,
      ruleType: rule.ruleType,
      severity: rule.severity,
      metric: rule.metric,
      comparator: rule.comparator,
      enabled: rule.enabled,
      ...(rule.threshold !== null ? { threshold: rule.threshold } : {}),
      ...(rule.severityThreshold !== null ? { severityThreshold: rule.severityThreshold } : {}),
      ...(rule.windowMinutes !== null ? { windowMinutes: rule.windowMinutes } : {}),
      ...(rule.condition !== null ? { condition: rule.condition } : {}),
    });
  }

  for (const rule of data.automationRules) {
    await createAutomationRule({
      projectId: rule.projectId,
      name: `${rule.name} (restored)`,
      minSeverity: rule.minSeverity,
      trigger: rule.trigger,
      priority: rule.priority,
      action: rule.action,
      autoExecute: rule.autoExecute,
      approvalRequired: rule.approvalRequired,
      cooldownMinutes: rule.cooldownMinutes,
      maxExecutionsPerHour: rule.maxExecutionsPerHour,
      enabled: rule.enabled,
      ...(rule.checkType !== null ? { checkType: rule.checkType } : {}),
      ...(rule.conditions !== null ? { conditions: rule.conditions } : {}),
    });
  }

  for (const window of data.maintenanceWindows) {
    await createMaintenanceWindow({
      projectId: window.projectId,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      reason: `${window.reason} (restored)`,
    });
  }

  for (const setting of data.notificationSettings) {
    await upsertNotificationSetting({
      userId: setting.userId,
      channelId: setting.channelId,
      enabled: setting.enabled,
      quietHoursStart: setting.quietHoursStart,
      quietHoursEnd: setting.quietHoursEnd,
      severityFilter: setting.severityFilter,
      projectFilter: setting.projectFilter,
    });
  }

  await markSystemBackupRestored(backupId, restoredBy);

  return {
    alertRulesRestored: data.alertRules.length,
    automationRulesRestored: data.automationRules.length,
    maintenanceWindowsRestored: data.maintenanceWindows.length,
    notificationSettingsRestored: data.notificationSettings.length,
  };
}
