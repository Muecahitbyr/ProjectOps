// Phase 30 "Enterprise Reliability, Automated Recovery & Operational
// Resilience" - der zentrale Safety-Gate fuer Recovery-Ausfuehrungen
// (Auftragspunkt 4 "Safety Gates"). Wird von ZWEI Stellen aufgerufen:
//   1. routes/incidents.routes.ts (manueller Incident->Recovery-Fluss)
//   2. automation/automation-engine.ts (automatischer Regel-Trigger)
// KEINE zweite Automation-/Scheduler-Engine - dies ist reine, lesende
// Entscheidungslogik ueber bereits bestehende Datenquellen (Changes,
// Wartungsfenster, Automation-Executions), keine eigene Persistenz
// (Auftragspunkt 5: "wenn ein Safety Check rein lesend ist, keine
// kuenstliche Persistierung").
import { getServiceByProjectId } from "../db/services.repository";
import { listChangesForServiceIds } from "../db/changes.repository";
import { getActiveMaintenanceWindow } from "../db/maintenance.repository";
import { findActionByRuleAndIncident, getAutomationActionById } from "../db/automation.repository";
import { getLatestExecutionForAction, countExecutionsForAction } from "../db/automation-executions.repository";
import { listAutomationRules } from "../db/automation-rules.repository";
import { hasAutomationExecutor } from "../automation/safe-action-runner";
import type { AutomationRule } from "../types/automation.types";
import type { Service } from "../types/service.types";
import type { Incident } from "../types/incident.types";

export type RecoverySafetyVerdict = "READY" | "BLOCKED" | "COOLDOWN" | "ALREADY_RUNNING" | "COMPLETED" | "FAILED";

export interface RecoverySafetyResult {
  verdict: RecoverySafetyVerdict;
  reason: string | null;
  // Bereits bestehende Aktion fuer dieses (Regel, Incident)-Paar, falls
  // vorhanden (COMPLETED/FAILED/COOLDOWN/ALREADY_RUNNING beziehen sich
  // darauf) - null bei READY/BLOCKED ohne Vorgeschichte.
  existingActionId: number | null;
  attempts: number;
  maxAttempts: number;
  cooldownEndsAt: string | null;
}

function minutesSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

// Auftragspunkt 4 "Change laeuft?" - wiederverwendet listChangesForServiceIds
// (Phase 28) statt einer neuen Abfrage; NUR relevant, wenn das Projekt
// tatsaechlich einen Service im Katalog hat (Phase 23) - sonst dataGap-artig
// uebersprungen (kein Fehlschlag, siehe Rueckgabe unten in evaluateRecoverySafety).
async function isChangeInProgressForProject(projectId: string): Promise<boolean> {
  const service = await getServiceByProjectId(projectId);
  if (!service) return false;
  const changes = await listChangesForServiceIds([service.id], ["IN_PROGRESS"]);
  return changes.length > 0;
}

export interface EvaluateRecoverySafetyOptions {
  // Automatische (regelbasierte) Ausfuehrungen sind standardmaessig auf
  // niedrigere Risikostufen begrenzt (Auftragspunkt 7 "Automatic Recovery
  // muss standardmaessig sicher begrenzt sein") - manuelle Ausfuehrungen
  // durch einen bereits per RBAC autorisierten Menschen unterliegen dieser
  // zusaetzlichen Grenze nicht.
  automatic?: boolean;
}

// Auftragspunkt 4 "Safety Gates" - deterministische Pruefreihenfolge, jeder
// BLOCKED-Fall liefert einen konkreten, nachvollziehbaren Grund (nie ein
// generisches "nicht erlaubt"). incident=undefined deckt den Fall ab, in dem
// die automatische Regel-Engine (noch) keinen Incident kennt (z.B.
// CHECK_FAILED vor Incident-Erzeugung) - dann werden nur die
// projekt-/regelweiten Gates geprueft.
export async function evaluateRecoverySafety(
  rule: AutomationRule,
  incident: Incident | undefined,
  options: EvaluateRecoverySafetyOptions = {},
): Promise<RecoverySafetyResult> {
  const empty: Omit<RecoverySafetyResult, "verdict" | "reason"> = {
    existingActionId: null,
    attempts: 0,
    maxAttempts: rule.maxAttemptsPerIncident,
    cooldownEndsAt: null,
  };

  if (!rule.enabled) {
    return { verdict: "BLOCKED", reason: "Diese Recovery-Regel ist deaktiviert", ...empty };
  }

  if (options.automatic && (rule.riskLevel === "HIGH" || rule.riskLevel === "CRITICAL")) {
    return {
      verdict: "BLOCKED",
      reason: `Automatische Ausfuehrung ist fuer Risiko ${rule.riskLevel} nicht erlaubt - erfordert eine manuelle Ausloesung durch einen berechtigten Benutzer`,
      ...empty,
    };
  }

  if (incident !== undefined && incident.resolvedAt !== null) {
    return { verdict: "BLOCKED", reason: "Der Incident ist bereits geloest", ...empty };
  }

  // Auftragspunkt 3/4 "existierende Recovery-Historie fuer diesen Incident" -
  // ALREADY_RUNNING/COOLDOWN/COMPLETED/FAILED beziehen sich alle auf diese
  // eine, per (rule_id, incident_id) eindeutige Aktion (Migration 0053).
  let existingActionId: number | null = null;
  let attempts = 0;
  if (incident !== undefined) {
    const existing = await findActionByRuleAndIncident(rule.id, incident.id);
    if (existing) {
      existingActionId = existing.id;
      attempts = await countExecutionsForAction(existing.id);
      const latest = await getLatestExecutionForAction(existing.id);

      if (latest && (latest.status === "CREATED" || latest.status === "RUNNING")) {
        return {
          verdict: "ALREADY_RUNNING",
          reason: "Fuer diesen Incident laeuft bereits eine Ausfuehrung dieser Recovery-Aktion",
          existingActionId,
          attempts,
          maxAttempts: rule.maxAttemptsPerIncident,
          cooldownEndsAt: null,
        };
      }

      if (attempts >= rule.maxAttemptsPerIncident) {
        return {
          verdict: latest?.status === "SUCCESS" ? "COMPLETED" : "FAILED",
          reason:
            latest?.status === "SUCCESS"
              ? "Diese Recovery-Aktion wurde fuer diesen Incident bereits erfolgreich abgeschlossen"
              : `Maximale Anzahl an Wiederholungen (${rule.maxAttemptsPerIncident}) fuer diesen Incident erreicht, letzter Versuch war nicht erfolgreich`,
          existingActionId,
          attempts,
          maxAttempts: rule.maxAttemptsPerIncident,
          cooldownEndsAt: null,
        };
      }

      if (latest && rule.cooldownMinutes > 0) {
        const referenceAt = latest.finishedAt ?? latest.startedAt ?? latest.createdAt;
        const elapsed = minutesSince(referenceAt);
        if (elapsed < rule.cooldownMinutes) {
          const cooldownEndsAt = new Date(new Date(referenceAt).getTime() + rule.cooldownMinutes * 60_000).toISOString();
          return {
            verdict: "COOLDOWN",
            reason: `Cooldown aktiv - naechster Versuch fruehestens in ${Math.ceil(rule.cooldownMinutes - elapsed)} Minute(n) moeglich`,
            existingActionId,
            attempts,
            maxAttempts: rule.maxAttemptsPerIncident,
            cooldownEndsAt,
          };
        }
      }
    }
  }

  const projectId = incident?.projectId ?? rule.projectId;
  if (await isChangeInProgressForProject(projectId)) {
    return {
      verdict: "BLOCKED",
      reason: "Ein Change laeuft aktuell fuer den betroffenen Service - Recovery wird zurueckgestellt, um sich nicht mit der laufenden Aenderung zu ueberschneiden",
      existingActionId,
      attempts,
      maxAttempts: rule.maxAttemptsPerIncident,
      cooldownEndsAt: null,
    };
  }

  const maintenanceWindow = await getActiveMaintenanceWindow(projectId);
  if (maintenanceWindow) {
    return {
      verdict: "BLOCKED",
      reason: `Ein aktives Wartungsfenster besteht fuer dieses Projekt (bis ${maintenanceWindow.endsAt}) - Recovery wird zurueckgestellt`,
      existingActionId,
      attempts,
      maxAttempts: rule.maxAttemptsPerIncident,
      cooldownEndsAt: null,
    };
  }

  if (rule.approvalRequired && !options.automatic) {
    // Manueller Pfad: wenn bereits eine APPROVED-Aktion existiert (jemand hat
    // sie ueber das bestehende Automation-Center-Freigabe-Workflow
    // freigegeben), darf ausgefuehrt werden - sonst muss zuerst der
    // bestehende Freigabe-Workflow durchlaufen werden (keine zweite,
    // parallele Freigabe-UI).
    if (existingActionId !== null) {
      const existingAction = await getAutomationActionById(existingActionId);
      if (existingAction?.status !== "APPROVED") {
        return {
          verdict: "BLOCKED",
          reason: "Diese Recovery-Aktion erfordert eine Freigabe (Risiko/Regel-Konfiguration) - bitte zuerst im Automation Center genehmigen",
          existingActionId,
          attempts,
          maxAttempts: rule.maxAttemptsPerIncident,
          cooldownEndsAt: null,
        };
      }
    } else {
      return {
        verdict: "BLOCKED",
        reason: "Diese Recovery-Aktion erfordert eine Freigabe (Risiko/Regel-Konfiguration) - bitte zuerst im Automation Center genehmigen",
        existingActionId,
        attempts,
        maxAttempts: rule.maxAttemptsPerIncident,
        cooldownEndsAt: null,
      };
    }
  }

  return { verdict: "READY", reason: null, existingActionId, attempts, maxAttempts: rule.maxAttemptsPerIncident, cooldownEndsAt: null };
}

export interface RecoveryActionEntry {
  rule: AutomationRule;
  safety: RecoverySafetyResult;
  hasExecutor: boolean;
}

// Phase 32 "Enterprise Incident Command Center & Operational Coordination" -
// extrahiert aus routes/incidents.routes.ts GET .../recovery-actions
// (Phase 30), damit dieser bestehende Endpunkt UND der neue Command-
// Overview-Endpunkt (core/incident-command.ts) dieselbe Zusammensetzung
// verwenden - keine zweite Kopie derselben Logik, kein N+1 (eine Regel-
// Abfrage, dann je Regel EIN bereits batched-sicherer Safety-Check, siehe
// evaluateRecoverySafety()-Kommentare).
export async function listRecoveryActionsForIncident(incident: Incident): Promise<{ service: Service | null; recoveryActions: RecoveryActionEntry[] }> {
  const service = await getServiceByProjectId(incident.projectId);
  const rules = await listAutomationRules({ projectId: incident.projectId, trigger: "INCIDENT_CREATED" });

  const recoveryActions = await Promise.all(
    rules.map(async (rule) => ({
      rule,
      safety: await evaluateRecoverySafety(rule, incident),
      hasExecutor: hasAutomationExecutor(rule.action),
    })),
  );

  return { service: service ?? null, recoveryActions };
}
