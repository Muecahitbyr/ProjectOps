// Phase 51 "Enterprise Decision Execution & Closed-Loop Operations" -
// Bestandsanalyse-Ergebnis: die Automation-Execution-Kette (Phase 9-11/17/
// 21/30/40) ist bereits vollstaendig (State Machine, Approval, Race-
// Safety/Idempotenz, Timeout, Audit, Realtime/Webhook) - ABER
// db/automation-executions.repository.ts#getAutomationSuccessRate() misst
// ausschliesslich TECHNISCHEN Erfolg (status=SUCCESS). Dieses Modul prueft
// zusaetzlich den OPERATIVEN Erfolg: ist der Service nach einer technisch
// erfolgreichen Automatisierung tatsaechlich stabiler geworden? Reine
// Korrelation - KEINE neue Health-/Resilience-Berechnung, KEINE zweite
// Automation-/Audit-Engine:
//   - Kandidaten: db/automation-executions.repository.ts#listAutomationExecutions()
//     (Phase 17/30) - unveraendert.
//   - "War das ein Problem-behebender Trigger": db/automation.repository.ts
//     #getAutomationActionById() (Phase 9/17) - unveraendert.
//   - "Wurde es tatsaechlich besser": db/audit-log.repository.ts
//     #listAuditEntriesForProjectActions() (Phase 45/49) ueber den bereits
//     bestehenden RESILIENCE_STATUS_DEGRADED/RECOVERED-Trail (Phase 38) -
//     unveraendert.
//   - Historisierung des Ergebnisses: db/audit-log.repository.ts
//     #createAuditLogEntry() (Phase 44/45/49-Muster) - keine neue Tabelle.
import { listAutomationExecutions, getAutomationExecutionById } from "../db/automation-executions.repository";
import { getAutomationActionById } from "../db/automation.repository";
import { createAuditLogEntry, listAuditEntriesForProjectActions, listAuditLog } from "../db/audit-log.repository";
import { getProjectOrganizationId } from "../db/projects.repository";
import { logger } from "./logger";
import {
  AUTOMATION_OUTCOME_SWEEP_INTERVAL_MS,
  AUTOMATION_OUTCOME_VERIFICATION_WINDOW_MINUTES,
  AUTOMATION_OUTCOME_SWEEP_LOOKBACK_HOURS,
  AUTOMATION_OUTCOME_SWEEP_LIMIT,
  CORRECTIVE_AUTOMATION_TRIGGERS,
  AUTOMATION_OUTCOME_DRIFT_WINDOW_HOURS,
  AUTOMATION_OUTCOME_DRIFT_SWEEP_LOOKBACK_HOURS,
  AUTOMATION_OUTCOME_TRACK_RECORD_MIN_SAMPLE,
  AUTOMATION_OUTCOME_TRACK_RECORD_EFFECTIVE_RATIO,
  AUTOMATION_OUTCOME_TRACK_RECORD_INEFFECTIVE_RATIO,
  AUTOMATION_OUTCOME_TRACK_RECORD_LOOKBACK_HOURS,
} from "../config/automation-outcome-verification.config";
import type { AuditLogEntry } from "../types/audit.types";
import type {
  AutomationExecutionOutcome,
  AutomationExecutionOutcomeStatus,
  OutcomeDurability,
  AutomationOutcomeTrackRecordEntry,
} from "../types/automation-outcome.types";

const VERIFIED_ACTION = "AUTOMATION_OUTCOME_VERIFIED";
const TRANSITION_ACTIONS = ["RESILIENCE_STATUS_DEGRADED", "RESILIENCE_STATUS_RECOVERED"];
// Phase 52 "Continuous Operational Assurance" - dieselbe Audit-Aktion wie
// die urspruengliche Verifikation, unterschieden ueber metadata.phase (kein
// neues Audit-Vokabular). "INITIAL" fehlt bei bereits vor Phase 52
// geschriebenen Eintraegen (Rueckwaertskompatibilitaet, siehe
// resolveOutcomeForExecution() unten - ein fehlendes Feld wird wie
// "INITIAL" behandelt).
const DURABILITY_CHECK_PHASE = "DURABILITY_CHECK";

let lastSweepAt = 0;
let lastDriftSweepAt = 0;

function statusOfTransition(entry: AuditLogEntry): string | null {
  const value = entry.metadata?.newStatus;
  return typeof value === "string" ? value : null;
}

// Auftragspunkt 7 "Execution Success vs. Operational Outcome Success" - rein
// trajektorienbasiert (keine erfundene Baseline noetig): welcher Status
// wurde INNERHALB des Verifikationsfensters ZULETZT erreicht.
//   IMPROVED:      endet HEALTHY.
//   REGRESSED:     endet CRITICAL ueber eine echte, im Fenster beobachtete
//                  Verschlechterung.
//   NOT_IMPROVED:  Fenster abgelaufen, weder das eine noch das andere -
//                  die Aktion lief technisch durch, aber das zugrunde
//                  liegende Problem bestand unveraendert fort.
function classifyOutcome(inScopeTransitions: AuditLogEntry[]): AutomationExecutionOutcomeStatus {
  const last = inScopeTransitions[inScopeTransitions.length - 1];
  const lastStatus = last ? statusOfTransition(last) : null;
  if (lastStatus === "HEALTHY") return "IMPROVED";
  if (lastStatus === "CRITICAL") return "REGRESSED";
  return "NOT_IMPROVED";
}

function groupByProject(entries: AuditLogEntry[]): Map<string, AuditLogEntry[]> {
  const map = new Map<string, AuditLogEntry[]>();
  for (const entry of entries) {
    if (!entry.projectId) continue;
    const list = map.get(entry.projectId) ?? [];
    list.push(entry);
    map.set(entry.projectId, list);
  }
  return map;
}

export async function evaluateAutomationOutcomesIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < AUTOMATION_OUTCOME_SWEEP_INTERVAL_MS) {
    return;
  }
  lastSweepAt = now;

  const windowMs = AUTOMATION_OUTCOME_VERIFICATION_WINDOW_MINUTES * 60 * 1000;
  const lookbackMs = AUTOMATION_OUTCOME_SWEEP_LOOKBACK_HOURS * 60 * 60 * 1000;

  const recentExecutions = await listAutomationExecutions({ status: "SUCCESS", limit: AUTOMATION_OUTCOME_SWEEP_LIMIT });
  // Nur Executions, deren Verifikationsfenster bereits abgelaufen ist, aber
  // nicht aelter als der Sweep-Rueckblick (Auftragspunkt "keine unnoetigen
  // Queries"/"grosse Execution-Historien").
  const dueExecutions = recentExecutions.filter((e) => {
    if (e.dryRun || e.finishedAt === null) return false;
    const finishedAtMs = new Date(e.finishedAt).getTime();
    return now - finishedAtMs >= windowMs && now - finishedAtMs <= lookbackMs;
  });
  if (dueExecutions.length === 0) return;

  // Bereits verifizierte Executions ueberspringen (Idempotenz) - EINE
  // gebatchte Abfrage ueber alle betroffenen Projekte statt einer Abfrage
  // pro Execution.
  const candidateActions = await Promise.all(dueExecutions.map((e) => getAutomationActionById(e.automationActionId)));
  const correctiveCandidates = dueExecutions
    .map((execution, i) => ({ execution, action: candidateActions[i] }))
    .filter((c): c is { execution: typeof c.execution; action: NonNullable<typeof c.action> } => Boolean(c.action) && CORRECTIVE_AUTOMATION_TRIGGERS.includes(c.action!.trigger));
  if (correctiveCandidates.length === 0) return;

  const projectIds = [...new Set(correctiveCandidates.map((c) => c.action.projectId))];
  const since = new Date(now - lookbackMs).toISOString();
  const [verifiedEntries, transitionEntries] = await Promise.all([
    listAuditEntriesForProjectActions(projectIds, [VERIFIED_ACTION], since),
    listAuditEntriesForProjectActions(projectIds, TRANSITION_ACTIONS, since),
  ]);
  // Auftragspunkt "Idempotenz" - echter, live gefundener Bug-Fix: execution.id
  // ist zur Laufzeit ein STRING (die in diesem Projekt dokumentierte
  // BIGSERIAL/BIGINT->String-Eigenart von pg, siehe CLAUDE.md), waehrend das
  // TS-Interface "number" behauptet. Explizites Number()-Wrapping auf BEIDEN
  // Seiten (Schreiben unten UND Lesen hier) statt eines "typeof === number"-
  // Filters, der bei einem tatsaechlich als String gespeicherten Wert NIE
  // triff und dadurch bei jedem Sweep denselben Eintrag erneut verifiziert
  // haette (live als Duplikat beobachtet, vor diesem Fix).
  const alreadyVerifiedExecutionIds = new Set(
    verifiedEntries.map((e) => (e.metadata?.executionId !== undefined ? Number(e.metadata.executionId) : null)).filter((id): id is number => id !== null && !Number.isNaN(id)),
  );
  const transitionsByProject = groupByProject(transitionEntries);

  for (const { execution, action } of correctiveCandidates) {
    if (alreadyVerifiedExecutionIds.has(Number(execution.id))) continue;
    try {
      const finishedAt = new Date(execution.finishedAt!);
      const windowEnd = new Date(finishedAt.getTime() + windowMs);
      const transitions = transitionsByProject.get(action.projectId) ?? [];
      const inScope = transitions.filter((t) => {
        const at = new Date(t.createdAt);
        return at > finishedAt && at <= windowEnd;
      });
      const outcome = classifyOutcome(inScope);

      const organizationId = await getProjectOrganizationId(action.projectId);
      const entry = await createAuditLogEntry({
        action: VERIFIED_ACTION,
        category: "AUTOMATION",
        severity: outcome === "REGRESSED" ? "WARNING" : "INFO",
        projectId: action.projectId,
        message: `Automation execution #${execution.id} ("${action.action}") operational outcome: ${outcome}`,
        metadata: {
          organizationId,
          executionId: Number(execution.id),
          automationActionId: Number(action.id),
          actionType: action.action,
          trigger: action.trigger,
          outcome,
          windowMinutes: AUTOMATION_OUTCOME_VERIFICATION_WINDOW_MINUTES,
          finishedAt: execution.finishedAt,
        },
      });
      void entry;
    } catch (err) {
      logger.error("Automation-Outcome-Verifikation fehlgeschlagen", {
        executionId: execution.id,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// LESE-SEITE - berechnet PENDING/NOT_APPLICABLE live (nie persistiert, siehe
// Phase 49's identisches Muster fuer Forecast-Genauigkeit), liest bereits
// abgeschlossene Bewertungen aus dem oben geschriebenen Audit-Trail.
// ---------------------------------------------------------------------------
// Phase 52 "Continuous Operational Assurance" - schliesst die einzige echte
// Luecke in der Kette "...->Outcome->Re-Evaluation": evaluateAutomationOutcomesIfDue()
// oben bewertet eine Execution genau EINMAL. Dieser zweite, unabhaengig
// gedrosselte Sweep prueft bereits als IMPROVED verifizierte Executions ein
// zweites Mal, nachdem ihr 24h-Nachbeobachtungsfenster abgelaufen ist, ob
// die Verbesserung angehalten hat ("Regression nach erfolgreicher
// Remediation" - explizit gefordertes Testszenario). Bounded
// Top-N-Vorfilter (Auftragspunkt "keine unnoetigen Abfragen"): EINE
// org-weite listAuditLog()-Abfrage (category=AUTOMATION, seit dem
// 48h-Sweep-Fenster) statt einer Abfrage pro Projekt - dieselbe Technik wie
// Phase 43/46/47/48/49's bounded Kandidaten-Vorfilter.
export async function evaluateAutomationOutcomeDurabilityIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastDriftSweepAt < AUTOMATION_OUTCOME_SWEEP_INTERVAL_MS) {
    return;
  }
  lastDriftSweepAt = now;

  const driftWindowMs = AUTOMATION_OUTCOME_DRIFT_WINDOW_HOURS * 60 * 60 * 1000;
  const lookbackMs = AUTOMATION_OUTCOME_DRIFT_SWEEP_LOOKBACK_HOURS * 60 * 60 * 1000;
  const since = new Date(now - lookbackMs).toISOString();

  const recentEntries = await listAuditLog({ category: "AUTOMATION", from: since, limit: AUTOMATION_OUTCOME_SWEEP_LIMIT * 4 });

  const initialVerifications = recentEntries.filter(
    (e) => e.action === VERIFIED_ACTION && e.metadata?.outcome === "IMPROVED" && !e.metadata?.phase,
  );
  const dueForDriftCheck = initialVerifications.filter((e) => now - new Date(e.createdAt).getTime() >= driftWindowMs);
  if (dueForDriftCheck.length === 0) return;

  const alreadyChecked = new Set(
    recentEntries
      .filter((e) => e.action === VERIFIED_ACTION && e.metadata?.phase === DURABILITY_CHECK_PHASE)
      .map((e) => (e.metadata?.executionId !== undefined ? Number(e.metadata.executionId) : null))
      .filter((id): id is number => id !== null && !Number.isNaN(id)),
  );

  const projectIds = [...new Set(dueForDriftCheck.map((e) => e.projectId).filter((id): id is string => id !== null))];
  const transitionEntries = await listAuditEntriesForProjectActions(projectIds, TRANSITION_ACTIONS, since);
  const transitionsByProject = groupByProject(transitionEntries);

  for (const verification of dueForDriftCheck) {
    const executionIdRaw = verification.metadata?.executionId;
    const executionId = executionIdRaw !== undefined ? Number(executionIdRaw) : null;
    if (executionId === null || Number.isNaN(executionId) || !verification.projectId || alreadyChecked.has(executionId)) continue;

    try {
      const verifiedAt = new Date(verification.createdAt);
      const driftWindowEnd = new Date(verifiedAt.getTime() + driftWindowMs);
      const transitions = transitionsByProject.get(verification.projectId) ?? [];
      const regression = transitions.find((t) => {
        const at = new Date(t.createdAt);
        return at > verifiedAt && at <= driftWindowEnd && statusOfTransition(t) === "CRITICAL";
      });
      // Kein Regressions-Fund -> DURABLE wird LIVE beim Lesen abgeleitet
      // (Abwesenheit eines Eintrags), kein Schreibvorgang fuer den Normalfall.
      if (!regression) continue;

      const organizationId = await getProjectOrganizationId(verification.projectId);
      await createAuditLogEntry({
        action: VERIFIED_ACTION,
        category: "AUTOMATION",
        severity: "WARNING",
        projectId: verification.projectId,
        message: `Automation execution #${executionId} operational improvement did not hold: regressed to CRITICAL at ${regression.createdAt}.`,
        metadata: {
          organizationId,
          executionId,
          automationActionId: verification.metadata?.automationActionId,
          actionType: verification.metadata?.actionType,
          trigger: verification.metadata?.trigger,
          phase: DURABILITY_CHECK_PHASE,
          originalVerifiedAt: verification.createdAt,
          regressedAt: regression.createdAt,
        },
      });
    } catch (err) {
      // Race-Sicherheit: idx_audit_log_durability_check_once (Migration
      // 0063) verhindert einen doppelten Durability-Check-Eintrag, falls ein
      // ZWEITER, unabhaengiger Prozess dieselbe Execution zeitgleich
      // ausgewertet hat (live durch einen Zwei-Prozess-Test bestaetigt) -
      // ein "23505"-Unique-Violation hier ist der ERWARTETE, bereits durch
      // den anderen Prozess korrekt geschriebene Endzustand, kein Fehler.
      const isDuplicateRace = typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
      if (isDuplicateRace) {
        logger.debug("Automation-Outcome-Durability-Check bereits von einem anderen Durchlauf geschrieben", { executionId });
        continue;
      }
      logger.error("Automation-Outcome-Durability-Pruefung fehlgeschlagen", {
        executionId,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }
}

// Phase 53 "Enterprise Operational Learning & Optimization" - schliesst die
// einzige echte Luecke der Kette "Decision -> Execution -> Outcome ->
// Effectiveness -> Feedback -> zukuenftige Decision": Phase 51/52 schreiben
// bereits einen vollstaendigen operativen Outcome-/Durability-Trail pro
// Execution, aber nichts aggregiert ihn ueber die Zeit, und
// core/decision-context.ts (Phase 50) konnte daher nie wissen, ob eine
// bestimmte Automations-Art fuer EIN Projekt historisch tatsaechlich half.
// Liest denselben, bereits bestehenden AUTOMATION_OUTCOME_VERIFIED-Trail
// (project-skaliert, dieselbe listAuditEntriesForProjectActions()-Abfrage
// wie evaluateAutomationOutcomesIfDue()/resolveOutcomeForExecution() oben) -
// keine neue Repository-Funktion, keine neue Tabelle, keine neue Engine.
export async function getAutomationOutcomeTrackRecord(projectId: string, lookbackHours = AUTOMATION_OUTCOME_TRACK_RECORD_LOOKBACK_HOURS): Promise<AutomationOutcomeTrackRecordEntry[]> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const entries = await listAuditEntriesForProjectActions([projectId], [VERIFIED_ACTION], since);

  const initial = entries.filter((e) => !e.metadata?.phase);
  const laterRegressedExecutionIds = new Set(
    entries
      .filter((e) => e.metadata?.phase === DURABILITY_CHECK_PHASE)
      .map((e) => (e.metadata?.executionId !== undefined ? Number(e.metadata.executionId) : null))
      .filter((id): id is number => id !== null && !Number.isNaN(id)),
  );

  const byActionType = new Map<string, { trigger: string; durable: number; regressed: number; notImproved: number }>();
  for (const entry of initial) {
    const actionType = typeof entry.metadata?.actionType === "string" ? entry.metadata.actionType : "UNKNOWN";
    const trigger = typeof entry.metadata?.trigger === "string" ? entry.metadata.trigger : "UNKNOWN";
    const executionIdRaw = entry.metadata?.executionId;
    const executionId = executionIdRaw !== undefined ? Number(executionIdRaw) : null;
    const status = entry.metadata?.outcome;

    const bucket = byActionType.get(actionType) ?? { trigger, durable: 0, regressed: 0, notImproved: 0 };
    const laterRegressed = executionId !== null && !Number.isNaN(executionId) && laterRegressedExecutionIds.has(executionId);
    if (status === "REGRESSED" || (status === "IMPROVED" && laterRegressed)) {
      bucket.regressed += 1;
    } else if (status === "IMPROVED") {
      bucket.durable += 1;
    } else if (status === "NOT_IMPROVED") {
      bucket.notImproved += 1;
    }
    byActionType.set(actionType, bucket);
  }

  return [...byActionType.entries()].map(([actionType, bucket]) => {
    const totalVerified = bucket.durable + bucket.regressed + bucket.notImproved;
    const durableRatio = totalVerified > 0 ? bucket.durable / totalVerified : 0;
    const classification: AutomationOutcomeTrackRecordEntry["classification"] =
      totalVerified < AUTOMATION_OUTCOME_TRACK_RECORD_MIN_SAMPLE
        ? "INSUFFICIENT_DATA"
        : durableRatio >= AUTOMATION_OUTCOME_TRACK_RECORD_EFFECTIVE_RATIO
          ? "EFFECTIVE"
          : durableRatio <= AUTOMATION_OUTCOME_TRACK_RECORD_INEFFECTIVE_RATIO
            ? "INEFFECTIVE"
            : "MIXED";
    return {
      actionType,
      trigger: bucket.trigger,
      totalVerified,
      durableImprovedCount: bucket.durable,
      regressedCount: bucket.regressed,
      notImprovedCount: bucket.notImproved,
      classification,
    };
  });
}

export async function getExecutionOutcome(executionId: number): Promise<AutomationExecutionOutcome | undefined> {
  const execution = await getAutomationExecutionById(executionId);
  if (!execution) return undefined;
  const action = await getAutomationActionById(execution.automationActionId);
  if (!action) return undefined;

  return resolveOutcomeForExecution(execution, action);
}

async function resolveOutcomeForExecution(
  execution: { id: number; status: string; dryRun: boolean; finishedAt: string | null },
  action: { id: number; projectId: string; trigger: string; action: string },
): Promise<AutomationExecutionOutcome> {
  // Number()-Normalisierung siehe Kommentar bei alreadyVerifiedExecutionIds
  // oben - dieselbe BIGSERIAL/BIGINT->String-Eigenart gilt hier ebenso.
  const base = { executionId: Number(execution.id), automationActionId: Number(action.id), actionType: action.action, trigger: action.trigger, projectId: action.projectId };
  const noDurability = { durability: null, durabilityReason: null, regressedAt: null } as const;

  if (execution.status !== "SUCCESS" || execution.dryRun || !CORRECTIVE_AUTOMATION_TRIGGERS.includes(action.trigger) || !execution.finishedAt) {
    return { ...base, status: "NOT_APPLICABLE", reason: execution.status !== "SUCCESS" ? "Execution did not succeed technically." : execution.dryRun ? "Dry run - no real change was made." : "This execution was not triggered by a corrective (problem-driven) signal.", verifiedAt: null, ...noDurability };
  }

  // Phase 52: der Lookback fuer die urspruengliche Verifikation muss
  // mindestens das Durability-Drift-Fenster abdecken - sonst wuerde eine
  // laengst verifizierte, aber >24h alte IMPROVED-Execution hier faelschlich
  // als "noch nicht verifiziert" (PENDING) erscheinen, obwohl sie fuer die
  // Durability-Pruefung noch relevant ist.
  const readLookbackHours = Math.max(AUTOMATION_OUTCOME_SWEEP_LOOKBACK_HOURS, AUTOMATION_OUTCOME_DRIFT_SWEEP_LOOKBACK_HOURS);
  const since = new Date(Date.now() - readLookbackHours * 60 * 60 * 1000).toISOString();
  const verifiedEntries = await listAuditEntriesForProjectActions([action.projectId], [VERIFIED_ACTION], since);
  const match = verifiedEntries.find((e) => e.metadata?.executionId !== undefined && Number(e.metadata.executionId) === Number(execution.id) && !e.metadata?.phase);
  if (match) {
    const status = match.metadata!.outcome as AutomationExecutionOutcomeStatus;
    if (status !== "IMPROVED") {
      return { ...base, status, reason: match.message, verifiedAt: match.createdAt, ...noDurability };
    }

    // Durability wird ab dem Zeitpunkt der urspruenglichen Verifikation
    // gesucht (statt einem now-relativen Lookback) - ein
    // Durability-Check-Eintrag entsteht immer NACH ihr, egal wie alt sie ist.
    const durabilityEntries = await listAuditEntriesForProjectActions([action.projectId], [VERIFIED_ACTION], match.createdAt);
    const durabilityMatch = durabilityEntries.find(
      (e) => e.metadata?.phase === DURABILITY_CHECK_PHASE && e.metadata?.executionId !== undefined && Number(e.metadata.executionId) === Number(execution.id),
    );
    if (durabilityMatch) {
      return {
        ...base,
        status,
        reason: match.message,
        verifiedAt: match.createdAt,
        durability: "REGRESSED" as OutcomeDurability,
        durabilityReason: durabilityMatch.message,
        regressedAt: typeof durabilityMatch.metadata?.regressedAt === "string" ? durabilityMatch.metadata.regressedAt : durabilityMatch.createdAt,
      };
    }

    const verifiedAtMs = new Date(match.createdAt).getTime();
    const driftElapsed = Date.now() - verifiedAtMs >= AUTOMATION_OUTCOME_DRIFT_WINDOW_HOURS * 60 * 60 * 1000;
    return {
      ...base,
      status,
      reason: match.message,
      verifiedAt: match.createdAt,
      durability: (driftElapsed ? "DURABLE" : "MONITORING") as OutcomeDurability,
      durabilityReason: driftElapsed
        ? `No regression detected within the ${AUTOMATION_OUTCOME_DRIFT_WINDOW_HOURS}h durability window after the initial verification.`
        : `Durability window (${AUTOMATION_OUTCOME_DRIFT_WINDOW_HOURS}h after verification) has not elapsed yet.`,
      regressedAt: null,
    };
  }

  const finishedAtMs = new Date(execution.finishedAt).getTime();
  const windowElapsed = Date.now() - finishedAtMs >= AUTOMATION_OUTCOME_VERIFICATION_WINDOW_MINUTES * 60 * 1000;
  return {
    ...base,
    status: "PENDING",
    reason: windowElapsed ? "Verification window has elapsed - result will be recorded on the next scheduled check." : `The ${AUTOMATION_OUTCOME_VERIFICATION_WINDOW_MINUTES}-minute verification window has not elapsed yet.`,
    verifiedAt: null,
    ...noDurability,
  };
}
