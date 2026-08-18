import { pool } from "../db/pool";
import { healthScoreConfig, SUCCESSFUL_CHECK_STATUSES } from "../config/health.config";
import { getEnabledAlertRulesForProject, markAlertResolved, markAlertTriggered } from "../db/alerts.repository";
import {
  createAlertEvent,
  getLastEscalatedStep,
  getOpenAlertEvent,
  listDueEscalationSteps,
  markEscalationStepFired,
  resolveAlertEvent,
  touchAlertEvent,
} from "../db/alert-events.repository";
import { getActiveMaintenanceWindow } from "../db/maintenance.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { logger } from "../core/logger";
import { getProjectName } from "../config/projects.config";
import { dispatchNotificationEvent } from "../notifications/notification-event.service";
import { evaluateAutomationTriggers } from "../automation/automation-engine";
import { dispatchWebhookEvent } from "../core/webhook-dispatch";
import { getSloById } from "../db/slo.repository";
import { computeSloCurrentState, sloWindow } from "../core/slo-calculator";
import { getOnCallScheduleById, listOnCallScheduleMembers, listOnCallOverridesInRange } from "../db/on-call.repository";
import { resolveCurrentOnCall } from "../core/on-call";
import { notifyImpactIfSignificant } from "../core/topology";
import { getUserById } from "../db/users.repository";
import type {
  AlertComparator,
  AlertEscalationStep,
  AlertEvent,
  AlertRule,
  AnomalyCondition,
  CompositeCondition,
  TrendCondition,
} from "../types/alert.types";
import type { MaintenanceWindow } from "../types/maintenance.types";

const SEVERITY_RANK: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

// alert_rules.severity (LOW/MEDIUM/HIGH/CRITICAL, Phase 7) auf die kleinere
// NotificationEventSeverity-Skala (INFO/WARNING/HIGH/CRITICAL, Phase 10)
// abgebildet - LOW/MEDIUM sind fuer Benachrichtigungszwecke beide "nicht
// dringend", HIGH/CRITICAL bleiben unveraendert 1:1.
function toNotificationSeverity(severity: string): "INFO" | "WARNING" | "HIGH" | "CRITICAL" {
  switch (severity) {
    case "LOW":
      return "INFO";
    case "MEDIUM":
      return "WARNING";
    case "HIGH":
      return "HIGH";
    default:
      return "CRITICAL";
  }
}

function compareNumeric(value: number, comparator: AlertComparator, threshold: number): boolean {
  switch (comparator) {
    case "LT":
      return value < threshold;
    case "LTE":
      return value <= threshold;
    case "GT":
      return value > threshold;
    case "GTE":
      return value >= threshold;
    case "EQ":
      return value === threshold;
  }
}

interface MetricResult {
  met: boolean;
  value: string;
}

// ---------------------------------------------------------------------------
// THRESHOLD (Phase 7, unveraendert)
// ---------------------------------------------------------------------------

// Hoechste Severity unter den aktuell offenen Incidents des Projekts - keine
// offenen Incidents bedeutet, die Regel kann nicht erfuellt sein.
async function measureIncidentSeverity(rule: AlertRule): Promise<MetricResult> {
  const { rows } = await pool.query<{ severity: string }>(
    `SELECT severity FROM incidents WHERE project_id = $1 AND resolved = false
     ORDER BY CASE severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC
     LIMIT 1`,
    [rule.projectId],
  );
  const topSeverity = rows[0]?.severity;
  if (!topSeverity || !rule.severityThreshold) {
    return { met: false, value: topSeverity ?? "none" };
  }
  const value = SEVERITY_RANK[topSeverity] ?? 0;
  const threshold = SEVERITY_RANK[rule.severityThreshold] ?? 0;
  return { met: compareNumeric(value, rule.comparator, threshold), value: topSeverity };
}

// Minuten seit dem letzten erfolgreichen Check-Ergebnis im Projekt. Gab es
// noch nie einen erfolgreichen Lauf, zaehlt die Zeit seit dem allerersten
// Ergebnis (das Projekt ist dann seither durchgehend nicht erreichbar).
async function measureOfflineDuration(rule: AlertRule): Promise<MetricResult | undefined> {
  if (rule.threshold === null) return undefined;

  const { rows } = await pool.query<{ minutes_offline: number | null }>(
    `SELECT
       EXTRACT(EPOCH FROM (now() - COALESCE(
         MAX(cr.checked_at) FILTER (WHERE cr.status = ANY($2::text[])),
         MIN(cr.checked_at)
       ))) / 60 AS minutes_offline
     FROM check_results cr
     JOIN checks c ON c.id = cr.check_id
     WHERE c.project_id = $1 AND c.enabled = true`,
    [rule.projectId, SUCCESSFUL_CHECK_STATUSES],
  );
  const minutes = rows[0]?.minutes_offline;
  if (minutes === null || minutes === undefined) return undefined;

  return { met: compareNumeric(minutes, rule.comparator, rule.threshold), value: `${Math.round(minutes)} Minuten` };
}

// Verbleibende Tage bis Zertifikatsablauf aus check_results.metadata
// (ssl.check.ts speichert daysRemaining seit Phase 7 strukturiert) - der
// kleinste Wert unter den SSL-Checks des Projekts.
async function measureSslExpiry(rule: AlertRule): Promise<MetricResult | undefined> {
  if (rule.threshold === null) return undefined;

  const { rows } = await pool.query<{ days_remaining: string | null }>(
    `SELECT MIN((latest.metadata->>'daysRemaining')::numeric) AS days_remaining
     FROM (
       SELECT DISTINCT ON (cr.check_id) cr.metadata
       FROM check_results cr
       JOIN checks c ON c.id = cr.check_id
       WHERE c.project_id = $1 AND c.type = 'ssl' AND cr.metadata ? 'daysRemaining'
       ORDER BY cr.check_id, cr.checked_at DESC
     ) latest`,
    [rule.projectId],
  );
  const daysRemaining = rows[0]?.days_remaining;
  if (daysRemaining === null || daysRemaining === undefined) return undefined;

  const value = Number(daysRemaining);
  return { met: compareNumeric(value, rule.comparator, rule.threshold), value: `${value} Tage` };
}

// Durchschnittliche Antwortzeit ueber den jeweils neuesten Messwert jedes
// Checks im Projekt (nicht nur "response-time"-Checks, da z.B. auch
// "http" eine Antwortzeit liefert).
async function measureResponseTime(rule: AlertRule): Promise<MetricResult | undefined> {
  if (rule.threshold === null) return undefined;

  const { rows } = await pool.query<{ avg_response_time_ms: string | null }>(
    `SELECT AVG(latest.response_time_ms) AS avg_response_time_ms
     FROM (
       SELECT DISTINCT ON (cr.check_id) cr.response_time_ms
       FROM check_results cr
       JOIN checks c ON c.id = cr.check_id
       WHERE c.project_id = $1 AND c.enabled = true AND cr.response_time_ms IS NOT NULL
       ORDER BY cr.check_id, cr.checked_at DESC
     ) latest`,
    [rule.projectId],
  );
  const avg = rows[0]?.avg_response_time_ms;
  if (avg === null || avg === undefined) return undefined;

  const value = Number(avg);
  return { met: compareNumeric(value, rule.comparator, rule.threshold), value: `${Math.round(value)}ms` };
}

// Anzahl fehlgeschlagener Check-Ergebnisse im Projekt innerhalb des
// konfigurierten Zeitfensters (windowMinutes) - z.B. "mehr als 5 Fehler in
// 10 Minuten".
async function measureErrorCount(rule: AlertRule): Promise<MetricResult | undefined> {
  if (rule.threshold === null || rule.windowMinutes === null) return undefined;

  const { rows } = await pool.query<{ error_count: string }>(
    `SELECT COUNT(*) AS error_count
     FROM check_results cr
     JOIN checks c ON c.id = cr.check_id
     WHERE c.project_id = $1 AND c.enabled = true
       AND cr.status IN ('ERROR', 'OFFLINE')
       AND cr.checked_at >= now() - ($2 || ' minutes')::interval`,
    [rule.projectId, rule.windowMinutes],
  );
  const value = Number(rows[0]?.error_count ?? 0);
  return { met: compareNumeric(value, rule.comparator, rule.threshold), value: String(value) };
}

// Phase 22 Auftragspunkt 9 "SLO Alerting" - EIN gemeinsamer Einstiegspunkt
// (core/slo-calculator.ts#computeSloCurrentState), auch von
// core/slo-evaluator.ts und den SLO-Routen verwendet - keine zweite,
// abweichende Berechnung fuer den Alert-Pfad.
async function measureSlo(rule: AlertRule, useBurnRate: boolean): Promise<MetricResult | undefined> {
  if (rule.sloId === null) return undefined;
  const slo = await getSloById(rule.sloId);
  if (!slo || !slo.enabled) return undefined;
  const { from, to } = sloWindow(slo);
  const { sliValue, errorBudget } = await computeSloCurrentState(slo, from, to);
  const value = useBurnRate ? errorBudget.burnRate : sliValue;
  if (rule.threshold === null) return undefined;
  return { met: compareNumeric(value, rule.comparator, rule.threshold), value: String(value) };
}

async function measureThreshold(rule: AlertRule, healthScore: number): Promise<MetricResult | undefined> {
  switch (rule.metric) {
    case "HEALTH_SCORE":
      return rule.threshold === null
        ? undefined
        : { met: compareNumeric(healthScore, rule.comparator, rule.threshold), value: String(healthScore) };
    case "INCIDENT_SEVERITY":
      return measureIncidentSeverity(rule);
    case "OFFLINE_DURATION":
      return measureOfflineDuration(rule);
    case "SSL_EXPIRY":
      return measureSslExpiry(rule);
    case "RESPONSE_TIME":
      return measureResponseTime(rule);
    case "ERROR_COUNT":
      return measureErrorCount(rule);
    case "SLO_BREACH":
      return measureSlo(rule, false);
    case "SLO_BURN_RATE":
      return measureSlo(rule, true);
    case "MULTIPLE_CHECKS_OFFLINE":
    case "INCIDENT_SPIKE":
      // Diese beiden Pseudo-Metriken existieren nur fuer COMPOSITE-Regeln
      // (siehe measureComposite) und werden bei rule_type=THRESHOLD nicht
      // erwartet - defensiv als "nicht erfuellt" behandeln.
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// TREND (Phase 9): "Health Score faellt kontinuierlich" u.ae. - prueft, ob
// die letzten N Zeit-Buckets streng monoton fallen/steigen.
// ---------------------------------------------------------------------------
const TREND_PENALTY_SQL = `CASE cr.status
  WHEN 'ONLINE' THEN 0
  WHEN 'WARNING' THEN ${healthScoreConfig.warningPenalty}
  WHEN 'ERROR' THEN ${healthScoreConfig.errorPenalty}
  WHEN 'OFFLINE' THEN ${healthScoreConfig.offlinePenalty}
  ELSE 0
END`;

async function measureTrend(rule: AlertRule): Promise<MetricResult | undefined> {
  const condition = rule.condition as TrendCondition | null;
  if (!condition || condition.type !== "TREND") return undefined;

  const lookbackMinutes = condition.consecutivePoints * condition.bucketMinutes;
  const { rows } = await pool.query<{
    bucket: string | Date;
    avg_penalty: string | null;
    avg_response_time_ms: string | null;
    error_count: string;
  }>(
    `SELECT
       date_bin(($1 || ' minutes')::interval, cr.checked_at, now() - ($2 || ' minutes')::interval) AS bucket,
       AVG(${TREND_PENALTY_SQL}) AS avg_penalty,
       AVG(cr.response_time_ms) AS avg_response_time_ms,
       COUNT(*) FILTER (WHERE cr.status IN ('ERROR', 'OFFLINE')) AS error_count
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE c.project_id = $3 AND c.enabled = true AND cr.checked_at >= now() - ($2 || ' minutes')::interval
     GROUP BY bucket
     ORDER BY bucket`,
    [condition.bucketMinutes, lookbackMinutes, rule.projectId],
  );

  if (rows.length < condition.consecutivePoints) {
    // Noch nicht genug Historie fuer eine verlaessliche Trend-Aussage.
    return undefined;
  }

  const relevant = rows.slice(-condition.consecutivePoints);
  const points = relevant.map((row) => {
    if (condition.metric === "HEALTH_SCORE") {
      return row.avg_penalty === null ? null : healthScoreConfig.maxScore - Number(row.avg_penalty);
    }
    if (condition.metric === "RESPONSE_TIME") {
      return row.avg_response_time_ms === null ? null : Number(row.avg_response_time_ms);
    }
    return Number(row.error_count);
  });

  if (points.some((point) => point === null)) return undefined;
  const values = points as number[];

  let isTrend = true;
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const current = values[i]!;
    isTrend = isTrend && (condition.direction === "DECREASING" ? current < prev : current > prev);
  }

  return { met: isTrend, value: values.map((v) => Math.round(v)).join(" -> ") };
}

// ---------------------------------------------------------------------------
// ANOMALY (Phase 9): "Fehlerquote steigt ungewoehnlich" - aktueller Bucket
// vs. statistische Baseline (Mittelwert + Multiplikator * Stddev) der davor
// liegenden Buckets derselben Groesse.
// ---------------------------------------------------------------------------
async function measureAnomaly(rule: AlertRule): Promise<MetricResult | undefined> {
  const condition = rule.condition as AnomalyCondition | null;
  if (!condition || condition.type !== "ANOMALY") return undefined;

  const totalMinutes = condition.windowMinutes + condition.baselineWindowMinutes;
  const { rows } = await pool.query<{ bucket: string | Date; avg_response_time_ms: string | null; error_count: string }>(
    `SELECT
       date_bin(($1 || ' minutes')::interval, cr.checked_at, now() - ($2 || ' minutes')::interval) AS bucket,
       AVG(cr.response_time_ms) AS avg_response_time_ms,
       COUNT(*) FILTER (WHERE cr.status IN ('ERROR', 'OFFLINE')) AS error_count
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE c.project_id = $3 AND c.enabled = true AND cr.checked_at >= now() - ($2 || ' minutes')::interval
     GROUP BY bucket
     ORDER BY bucket`,
    [condition.windowMinutes, totalMinutes, rule.projectId],
  );

  if (rows.length < 3) {
    // Zu wenige Buckets, um eine Baseline von der aktuellen Periode zu unterscheiden.
    return undefined;
  }

  const toValue = (row: (typeof rows)[number]): number =>
    condition.metric === "RESPONSE_TIME" ? Number(row.avg_response_time_ms ?? 0) : Number(row.error_count);

  const current = toValue(rows[rows.length - 1]!);
  const baselineValues = rows.slice(0, -1).map(toValue);
  const baselineMean = baselineValues.reduce((sum, v) => sum + v, 0) / baselineValues.length;
  const variance = baselineValues.reduce((sum, v) => sum + (v - baselineMean) ** 2, 0) / baselineValues.length;
  const baselineStdDev = Math.sqrt(variance);

  const anomalyThreshold = baselineMean + condition.stdDevMultiplier * baselineStdDev;
  const met = current > anomalyThreshold;

  return {
    met,
    value: `aktuell ${Math.round(current)} vs. Baseline ${Math.round(baselineMean)} (+/-${Math.round(baselineStdDev)})`,
  };
}

// ---------------------------------------------------------------------------
// COMPOSITE (Phase 9): "Mehrere Checks gleichzeitig offline" /
// "Incident-Spike erkannt".
// ---------------------------------------------------------------------------
async function measureComposite(rule: AlertRule): Promise<MetricResult | undefined> {
  const condition = rule.condition as CompositeCondition | null;
  if (!condition || condition.type !== "COMPOSITE") return undefined;

  if (condition.mode === "MULTIPLE_CHECKS_OFFLINE") {
    const { rows } = await pool.query<{ offline_count: string }>(
      `SELECT COUNT(*) AS offline_count FROM (
         SELECT DISTINCT ON (c.id) c.id, cr.status
         FROM checks c
         LEFT JOIN check_results cr ON cr.check_id = c.id
         WHERE c.project_id = $1 AND c.enabled = true
         ORDER BY c.id, cr.checked_at DESC
       ) latest WHERE status IN ('OFFLINE', 'ERROR')`,
      [rule.projectId],
    );
    const value = Number(rows[0]?.offline_count ?? 0);
    return { met: value >= condition.minCount, value: `${value} Checks offline` };
  }

  // INCIDENT_SPIKE
  const windowMinutes = condition.windowMinutes ?? 10;
  const { rows } = await pool.query<{ incident_count: string }>(
    `SELECT COUNT(*) AS incident_count FROM incidents
     WHERE project_id = $1 AND created_at >= now() - ($2 || ' minutes')::interval`,
    [rule.projectId, windowMinutes],
  );
  const value = Number(rows[0]?.incident_count ?? 0);
  return { met: value >= condition.minCount, value: `${value} Incidents in ${windowMinutes}min` };
}

async function evaluateRule(rule: AlertRule, healthScore: number): Promise<MetricResult | undefined> {
  switch (rule.ruleType) {
    case "THRESHOLD":
      return measureThreshold(rule, healthScore);
    case "TREND":
      return measureTrend(rule);
    case "ANOMALY":
      return measureAnomaly(rule);
    case "COMPOSITE":
      return measureComposite(rule);
  }
}

// ---------------------------------------------------------------------------
// Deduplizierung (alert_events) + Eskalation + Wartungsfenster-Unterdrueckung
// (Phase 9) - laeuft zusaetzlich zur bestehenden currently_triggered-Logik
// unten, aendert deren Verhalten nicht.
// ---------------------------------------------------------------------------
// Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" - loest fuer
// eine faellige Stufe MIT on_call_schedule_id den aktuell diensthabenden
// Nutzer auf (core/on-call.ts, dieselbe Berechnung wie GET .../on-call/
// schedules/:id/current). Best-effort: ein fehlendes/geloeschtes Schedule
// (on_call_schedule_id verweist per ON DELETE SET NULL nicht zwingend mehr
// auf ein existierendes Schedule) oder ein DB-Fehler darf die Eskalation
// selbst NIE verhindern - siehe core/audit-log.ts fuer denselben Grundsatz.
async function resolveOnCallForStep(step: AlertEscalationStep): Promise<{ userId: string; userName: string } | null> {
  if (!step.onCallScheduleId) return null;
  try {
    const schedule = await getOnCallScheduleById(step.onCallScheduleId);
    if (!schedule) return null;
    const now = new Date();
    const [members, overrides] = await Promise.all([
      listOnCallScheduleMembers(schedule.id),
      listOnCallOverridesInRange(schedule.id, now, now),
    ]);
    const current = resolveCurrentOnCall(schedule.id, schedule, members, overrides, now);
    if (!current.userId) return null;
    const user = await getUserById(current.userId);
    if (!user) return null;
    return { userId: user.id, userName: user.name };
  } catch (err) {
    logger.error("On-Call-Aufloesung fuer Eskalationsstufe fehlgeschlagen", {
      onCallScheduleId: step.onCallScheduleId,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    });
    return null;
  }
}

async function fireDueEscalations(rule: AlertRule, alertEvent: AlertEvent): Promise<void> {
  const elapsedMinutes = (Date.now() - new Date(alertEvent.startedAt).getTime()) / 60_000;
  const lastStep = await getLastEscalatedStep(alertEvent.id);
  const dueSteps = await listDueEscalationSteps(rule.id, lastStep, elapsedMinutes);

  for (const step of dueSteps) {
    await markEscalationStepFired(alertEvent.id, step.stepOrder);
    const onCall = await resolveOnCallForStep(step);
    const onCallSuffix = onCall ? ` Diensthabend: ${onCall.userName}.` : "";
    logger.warn("Alert eskaliert", {
      ruleId: rule.id,
      alertEventId: alertEvent.id,
      stepOrder: step.stepOrder,
      channelId: step.channelId,
      onCallUserId: onCall?.userId ?? null,
    });
    void dispatchWebhookEvent("ALERT_ESCALATED", {
      alertEvent,
      stepOrder: step.stepOrder,
      channelId: step.channelId,
      ...(onCall ? { onCallUserId: onCall.userId } : {}),
    });
    broadcast(
      createEvent(RealtimeEventType.ALERT_ESCALATED, {
        alertEvent,
        stepOrder: step.stepOrder,
        channelId: step.channelId,
      }),
    );
    // Phase 21 Auftragspunkt 5/19 "Notification Orchestration"/
    // "Performance" - fire-and-forget statt AWAIT, siehe Kommentar in
    // core/monitor.ts (notifyOffline) - derselbe gefundene Bug trat hier in
    // der Eskalations-/Trigger-Auswertung ebenfalls auf.
    void dispatchNotificationEvent({
      type: "ALERT_ESCALATED",
      projectId: rule.projectId,
      projectName: alertEvent.projectName,
      severity: toNotificationSeverity(rule.severity),
      title: `Alert eskaliert: ${rule.name}`,
      message: `Stufe ${step.stepOrder} ausgeloest fuer "${rule.name}" (Kanal: ${step.channelId}). Aktueller Wert: ${alertEvent.lastValue ?? "unbekannt"}.${onCallSuffix}`,
      timestamp: new Date().toISOString(),
      metadata: {
        ruleId: rule.id,
        alertEventId: alertEvent.id,
        stepOrder: step.stepOrder,
        channelId: step.channelId,
        ...(onCall ? { onCallUserId: onCall.userId } : {}),
      },
    });
    await evaluateAutomationTriggers("ALERT_ESCALATED", rule.projectId, {
      alertRuleId: rule.id,
      alertEventId: alertEvent.id,
      severity: rule.severity,
    });
  }
}

async function handleAlertEventLifecycle(
  rule: AlertRule,
  value: string,
  maintenanceWindow: MaintenanceWindow | undefined,
): Promise<void> {
  const suppressed = maintenanceWindow !== undefined;
  const status = suppressed ? "SUPPRESSED" : "TRIGGERED";
  const existing = await getOpenAlertEvent(rule.id);

  if (!existing) {
    const created = await createAlertEvent({
      alertRuleId: rule.id,
      projectId: rule.projectId,
      severity: rule.severity,
      status,
      value,
      ...(suppressed ? { suppressedReason: "MAINTENANCE" } : {}),
    });
    if (suppressed) {
      broadcast(createEvent(RealtimeEventType.ALERT_SUPPRESSED, created));
    } else {
      await fireDueEscalations(rule, created);
    }
    return;
  }

  const wasSuppressed = existing.status === "SUPPRESSED";
  const updated = await touchAlertEvent(existing.id, value, status, suppressed ? "MAINTENANCE" : null);
  if (!updated) return;

  if (suppressed && !wasSuppressed) {
    broadcast(createEvent(RealtimeEventType.ALERT_SUPPRESSED, updated));
  } else if (!suppressed) {
    await fireDueEscalations(rule, updated);
  }
}

async function resolveOpenAlertEventIfAny(ruleId: number): Promise<void> {
  const existing = await getOpenAlertEvent(ruleId);
  if (existing) {
    await resolveAlertEvent(existing.id);
  }
}

// Wird pro Projekt einmal je Scheduler-Tick aufgerufen (monitor.ts, direkt
// nachdem getProjectHealth() den aktuellen Health-Score fuer dieses Projekt
// berechnet hat). Ueberspringt Projekte ganz ohne Regeln, um die DB nicht
// unnoetig zu belasten.
export async function evaluateProjectAlertRules(projectId: string, healthScore: number): Promise<void> {
  const rules = await getEnabledAlertRulesForProject(projectId);
  if (rules.length === 0) return;

  const maintenanceWindow = await getActiveMaintenanceWindow(projectId);

  for (const rule of rules) {
    let result: MetricResult | undefined;
    try {
      result = await evaluateRule(rule, healthScore);
    } catch (err) {
      logger.error("Alert-Regel konnte nicht ausgewertet werden", {
        ruleId: rule.id,
        ruleType: rule.ruleType,
        metric: rule.metric,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
      continue;
    }

    if (!result) continue;

    // Bestehende Phase-7-Logik: alert_rules.currently_triggered/
    // last_triggered_* spiegelt immer den rohen Bedingungszustand wider,
    // unabhaengig von einem Wartungsfenster - "ist die Bedingung erfuellt"
    // bleibt objektiv, die Unterdrueckung greift erst bei Benachrichtigung/
    // Eskalation (siehe handleAlertEventLifecycle).
    if (result.met && !rule.currentlyTriggered) {
      const updated = await markAlertTriggered(rule.id, result.value);
      if (updated) {
        logger.warn("Alert-Regel ausgeloest", { ruleId: rule.id, projectId, metric: rule.metric, value: result.value });
        broadcast(createEvent(RealtimeEventType.ALERT_TRIGGERED, updated));
        void dispatchWebhookEvent("ALERT_TRIGGERED", updated);
        // Phase 25 "Automatische Integration" - fire-and-forget, gleiches
        // Muster wie die uebrigen void-Aufrufe hier.
        void notifyImpactIfSignificant(projectId, "ALERT", `Alert triggered: ${rule.name}`);
        void dispatchNotificationEvent({
          type: "ALERT_TRIGGERED",
          projectId,
          projectName: getProjectName(projectId),
          severity: toNotificationSeverity(rule.severity),
          title: `Alert ausgeloest: ${rule.name}`,
          message: `Regel "${rule.name}" (${rule.metric}) wurde ausgeloest. Aktueller Wert: ${result.value}.`,
          timestamp: new Date().toISOString(),
          metadata: { ruleId: rule.id, metric: rule.metric, value: result.value },
        });
        await evaluateAutomationTriggers("ALERT_TRIGGERED", projectId, {
          alertRuleId: rule.id,
          severity: rule.severity,
        });
      }
    } else if (!result.met && rule.currentlyTriggered) {
      const updated = await markAlertResolved(rule.id);
      if (updated) {
        broadcast(createEvent(RealtimeEventType.ALERT_UPDATED, updated));
      }
    }

    // Eigener try/catch: ein Fehler in Dedup/Eskalation (z.B. eine kaputte
    // Eskalationsstufe) darf niemals den gesamten Scheduler-Tick abbrechen -
    // die bereits oben aktualisierte currently_triggered-Kernlogik ist
    // damit robust von dieser zusaetzlichen Schicht entkoppelt.
    try {
      if (result.met) {
        await handleAlertEventLifecycle(rule, result.value, maintenanceWindow);
      } else {
        await resolveOpenAlertEventIfAny(rule.id);
      }
    } catch (err) {
      logger.error("Alert-Event-Historie/Eskalation fehlgeschlagen", {
        ruleId: rule.id,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }
}
