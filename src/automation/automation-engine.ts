import {
  countRuleTriggersInLastHour,
  getLastTriggeredAtForRule,
  listAutomationRules,
} from "../db/automation-rules.repository";
import { createRuleTriggeredAction, updateAutomationActionStatus } from "../db/automation.repository";
import { runAutomationExecution } from "./execution-runner";
import { isAutoExecutable } from "./safe-action-runner";
import { evaluateRecoverySafety } from "../core/recovery-safety";
import { getIncidentById } from "../db/incidents.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { logger } from "../core/logger";
import type { AutomationActionContext, AutomationRule, AutomationTrigger } from "../types/automation.types";

// Vereintes Rangsystem fuer beide in dieser Codebase vorkommenden
// Severity-Skalen (incidents.severity: LOW/MEDIUM/HIGH/CRITICAL, alert_rules.
// severity: INFO/WARNING/HIGH/CRITICAL) - automation_rules.min_severity
// nutzt die erste Skala, wird hier aber gegen Kontext aus beiden Quellen
// geprueft.
const SEVERITY_RANK: Record<string, number> = { LOW: 1, INFO: 1, MEDIUM: 2, WARNING: 2, HIGH: 3, CRITICAL: 4 };

export interface AutomationTriggerContext {
  incidentId?: number;
  checkId?: string;
  checkType?: string;
  severity?: string;
  healthScore?: number;
  alertRuleId?: number;
  alertEventId?: number;
  maintenanceWindowId?: number;
  rootIncidentId?: number;
  causeCheckType?: string;
}

function matchesRule(rule: AutomationRule, context: AutomationTriggerContext): boolean {
  if (rule.checkType && context.checkType && rule.checkType !== context.checkType) {
    return false;
  }
  if (context.severity !== undefined) {
    const contextRank = SEVERITY_RANK[context.severity] ?? 0;
    const minRank = SEVERITY_RANK[rule.minSeverity] ?? 0;
    if (contextRank < minRank) return false;
  }
  if (rule.conditions?.checkType && rule.conditions.checkType !== context.checkType) {
    return false;
  }
  if (rule.conditions?.healthScoreBelow !== undefined) {
    if (context.healthScore === undefined || context.healthScore >= rule.conditions.healthScoreBelow) return false;
  }
  if (rule.conditions?.healthScoreAbove !== undefined) {
    if (context.healthScore === undefined || context.healthScore <= rule.conditions.healthScoreAbove) return false;
  }
  return true;
}

function buildActionContext(context: AutomationTriggerContext): AutomationActionContext | undefined {
  const built: AutomationActionContext = {
    ...(context.checkId !== undefined ? { checkId: context.checkId } : {}),
    ...(context.alertRuleId !== undefined ? { alertRuleId: context.alertRuleId } : {}),
    ...(context.alertEventId !== undefined ? { alertEventId: context.alertEventId } : {}),
    ...(context.maintenanceWindowId !== undefined ? { maintenanceWindowId: context.maintenanceWindowId } : {}),
    ...(context.rootIncidentId !== undefined ? { rootIncidentId: context.rootIncidentId } : {}),
    ...(context.causeCheckType !== undefined ? { causeCheckType: context.causeCheckType } : {}),
  };
  return Object.keys(built).length > 0 ? built : undefined;
}

async function isRuleOnCooldown(rule: AutomationRule): Promise<boolean> {
  if (rule.cooldownMinutes <= 0) return false;
  const lastTriggeredAt = await getLastTriggeredAtForRule(rule.id);
  if (!lastTriggeredAt) return false;
  const elapsedMinutes = (Date.now() - new Date(lastTriggeredAt).getTime()) / 60_000;
  return elapsedMinutes < rule.cooldownMinutes;
}

// Phase 11 Teil 1 "Automation Rules aktivieren" - der zentrale Einstiegspunkt,
// von jeder Trigger-Quelle aufgerufen (core/monitor.ts, alerts/alert-evaluator.ts,
// incidents/incident-correlation.ts). Laedt alle aktivierten, zu Projekt+Trigger
// passenden Regeln (bereits nach priority sortiert, siehe
// db/automation-rules.repository.ts), prueft Zusatzbedingungen/Cooldown/
// Rate-Limit je Regel und erzeugt fuer jede zutreffende Regel eine
// Automatisierungs-Aktion - bei approval_required bleibt sie ein Vorschlag
// (WAITING_APPROVAL), sonst wird sie (falls die Aktion unbeaufsichtigt laufen
// darf) sofort ausgefuehrt.
export async function evaluateAutomationTriggers(
  trigger: AutomationTrigger,
  projectId: string,
  context: AutomationTriggerContext = {},
): Promise<void> {
  const rules = await listAutomationRules({ projectId, trigger, enabledOnly: true });
  if (rules.length === 0) return;

  for (const rule of rules) {
    try {
      if (!matchesRule(rule, context)) continue;

      if (await isRuleOnCooldown(rule)) {
        logger.info("Automatisierungsregel im Cooldown uebersprungen", { ruleId: rule.id, name: rule.name });
        continue;
      }

      const recentCount = await countRuleTriggersInLastHour(rule.id);
      if (recentCount >= rule.maxExecutionsPerHour) {
        logger.warn("Automatisierungsregel-Rate-Limit erreicht", { ruleId: rule.id, name: rule.name, recentCount, limit: rule.maxExecutionsPerHour });
        continue;
      }

      const actionContext = buildActionContext(context);
      const action = await createRuleTriggeredAction({
        projectId,
        ...(context.incidentId !== undefined ? { incidentId: context.incidentId } : {}),
        ruleId: rule.id,
        action: rule.action,
        trigger: `${trigger} (Regel "${rule.name}")`,
        ...(actionContext ? { context: actionContext } : {}),
      });

      logger.info("Automatisierungsregel ausgeloest", { ruleId: rule.id, name: rule.name, trigger, actionId: action.id });

      if (rule.approvalRequired) {
        broadcast(createEvent(RealtimeEventType.AUTOMATION_WAITING_APPROVAL, action));
        continue;
      }

      if (rule.autoExecute && isAutoExecutable(rule.action)) {
        // Phase 30 Auftragspunkt 4/7 "Safety Gates"/"Automatic vs Manual" -
        // bisher pruefte der automatische Pfad NUR Cooldown+stuendliches
        // Rate-Limit (oben) vor dem Ausfuehren, nicht ob gerade ein Change
        // laeuft, ein Wartungsfenster aktiv ist oder das Risiko fuer
        // unbeaufsichtigte Ausfuehrung ueberhaupt zulaessig ist - echte
        // Sicherheitsluecke, hier geschlossen. {automatic: true} begrenzt
        // zusaetzlich auf risk_level LOW/MEDIUM (siehe core/recovery-safety.ts).
        const incident = context.incidentId !== undefined ? await getIncidentById(context.incidentId) : undefined;
        const safety = await evaluateRecoverySafety(rule, incident, { automatic: true });
        if (safety.verdict !== "READY") {
          logger.info("Automatische Ausfuehrung durch Safety Gate zurueckgestellt", { ruleId: rule.id, actionId: action.id, verdict: safety.verdict, reason: safety.reason });
          continue;
        }
        await updateAutomationActionStatus(action.id, "APPROVED");
        await runAutomationExecution(action, { selfHealing: true, timeoutSeconds: rule.timeoutSeconds });
      }
    } catch (err) {
      logger.error("Automatisierungsregel-Auswertung fehlgeschlagen", {
        ruleId: rule.id,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }
}
