import { executeSafeAction, hasAutomationExecutor } from "./safe-action-runner";
import {
  createAutomationExecution,
  markExecutionFinished,
  markExecutionRunning,
} from "../db/automation-executions.repository";
import { appendAutomationLog } from "../db/automation-logs.repository";
import { addTimelineEvent } from "../db/incident-timeline.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { logger } from "../core/logger";
import { dispatchWebhookEvent } from "../core/webhook-dispatch";
import type { AutomationAction, AutomationExecution } from "../types/automation.types";
import type { ActionLogger } from "./safe-action-runner";

export interface RunAutomationExecutionOptions {
  dryRun?: boolean;
  approvedBy?: string;
  // undefined = das System (Scheduler/Regel-Engine) hat automatisch
  // ausgefuehrt, kein Mensch hat den Klick ausgeloest.
  executedBy?: string;
  // Nur gesetzt, wenn diese Ausfuehrung tatsaechlich unbeaufsichtigt durch
  // eine Regel ausgeloest wurde (siehe automation/automation-engine.ts) -
  // steuert, ob zusaetzlich SELF_HEALING_*-Events gesendet werden.
  selfHealing?: boolean;
  // Phase 30 Auftragspunkt 2 "Timeout" - Sekunden, nach denen eine laufende
  // Ausfuehrung als FAILED markiert wird (siehe automation_rules.
  // timeout_seconds, Migration 0053). Default deckt bestehende Aufrufer ab,
  // die (noch) keine Regel mit Timeout uebergeben.
  timeoutSeconds?: number;
}

const DEFAULT_EXECUTION_TIMEOUT_SECONDS = 120;

// Ehrliche Grenze: eine JS-Promise kann nicht wirklich abgebrochen werden,
// ohne dass executeSafeAction() selbst AbortSignal unterstuetzt (das tun nur
// die HTTP-basierten Checks intern, nicht jede Aktion). Der Timeout hier
// entscheidet daher NUR, wie lange auf ein Ergebnis gewartet wird, bevor die
// Ausfuehrung als FAILED persistiert wird - ein spaetes Ergebnis der
// eigentlich schon "getimeouteten" Aktion wird verworfen (result-Objekt der
// Promise.race-Verlierer-Seite), nicht heimlich doch noch als SUCCESS
// gespeichert. Alle bestehenden EXECUTABLE_AUTOMATION_ACTIONS sind kurze,
// datenbank-/HTTP-gebundene Operationen (siehe safe-action-runner.ts) - ein
// echter Timeout ist ein Sicherheitsnetz fuer den Ausnahmefall, kein
// erwarteter Normalfall.
function withTimeout<T>(promise: Promise<T>, timeoutSeconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout nach ${timeoutSeconds}s ueberschritten`));
    }, timeoutSeconds * 1000);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Gemeinsamer Ausfuehrungspfad fuer BEIDE Wege, eine sichere Aktion laufen
// zu lassen: den neuen, automatischen Regel-Trigger (automation-engine.ts)
// und die bestehende manuelle Freigabe (routes/automation-actions.routes.ts,
// POST /:id/execute). Uebernimmt Log-Streaming, Realtime-Events und die
// Persistierung von Start/Ende/Dauer - beide Aufrufer muessen das nicht mehr
// selbst tun.
//
// Phase 30 Auftragspunkt 5 "Race Safety" - der Rueckgabewert kann jetzt auch
// "ALREADY_RUNNING" sein: createAutomationExecution() faengt eine verletzte
// partielle Unique-Constraint ab (Migration 0053, hoechstens eine nicht-
// abgeschlossene Ausfuehrung je Aktion), das ist die AUTORITATIVE Race-
// Safety-Garantie (core/recovery-safety.ts liefert davor nur eine
// bestmoegliche, lesende Vorabpruefung).
export async function runAutomationExecution(
  action: AutomationAction,
  options: RunAutomationExecutionOptions = {},
): Promise<AutomationExecution | "ALREADY_RUNNING"> {
  const execution = await createAutomationExecution({
    automationActionId: action.id,
    dryRun: options.dryRun ?? false,
    ...(options.approvedBy !== undefined ? { approvedBy: options.approvedBy } : {}),
  });
  if (execution === "ALREADY_RUNNING") {
    return "ALREADY_RUNNING";
  }

  const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_EXECUTION_TIMEOUT_SECONDS;
  const log: ActionLogger = async (level, message) => {
    const entry = await appendAutomationLog({ executionId: execution.id, level, message, source: action.action });
    broadcast(createEvent(RealtimeEventType.EXECUTION_LOG, entry));
  };

  const running = await markExecutionRunning(execution.id, options.executedBy);
  const runningExecution = running ?? execution;

  broadcast(createEvent(RealtimeEventType.AUTOMATION_STARTED, { action, execution: runningExecution }));
  if (options.selfHealing) {
    broadcast(createEvent(RealtimeEventType.SELF_HEALING_STARTED, { action, execution: runningExecution }));
  }
  await log("INFO", `Ausfuehrung gestartet${options.dryRun ? " (Dry Run)" : ""}`);

  // Phase 21 Auftragspunkt 9/10 "Automation Integration"/"Safe Auto-
  // Remediation" - EIN Executor (dieser hier, unveraendert seit Phase 11),
  // keine zweite Ausfuehrungslogik. Nur wenn diese Aktion tatsaechlich mit
  // einem Incident verknuepft ist (action.incidentId), landet Start/Erfolg/
  // Fehlschlag zusaetzlich in dessen Timeline - unabhaengig davon, ob die
  // Aktion durch eine Alert-/Automation-Regel (INCIDENT_CREATED-Trigger)
  // oder manuell ueber die Automation-Center-UI ausgeloest wurde.
  if (action.incidentId !== null) {
    void addTimelineEvent({
      incidentId: action.incidentId,
      eventType: "AUTOMATION_STARTED",
      message: `Automatisierung "${action.action}" gestartet${options.dryRun ? " (Dry Run)" : ""}`,
      metadata: { automationActionId: action.id, action: action.action },
    });
  }

  try {
    if (!hasAutomationExecutor(action.action)) {
      throw new Error(`Aktion "${action.action}" hat keine Ausfuehrungslogik`);
    }

    const result = options.dryRun
      ? await (async () => {
          await log("INFO", `Dry Run - "${action.action}" wuerde jetzt fuer Projekt "${action.projectId}" ausgefuehrt, keine echte Aenderung`);
          return { dryRun: true, wouldExecute: action.action, projectId: action.projectId };
        })()
      : await withTimeout(executeSafeAction(action, log), timeoutSeconds);

    await log("INFO", "Erfolgreich abgeschlossen");
    const finished = await markExecutionFinished(execution.id, "SUCCESS", {
      result,
      exitCode: 0,
      stdout: JSON.stringify(result),
    });
    const finalExecution = finished ?? runningExecution;

    broadcast(createEvent(RealtimeEventType.AUTOMATION_FINISHED, { action, execution: finalExecution }));
    void dispatchWebhookEvent("AUTOMATION_FINISHED", { action, execution: finalExecution });
    if (options.selfHealing) {
      broadcast(createEvent(RealtimeEventType.SELF_HEALING_FINISHED, { action, execution: finalExecution }));
    }
    if (action.incidentId !== null) {
      void addTimelineEvent({
        incidentId: action.incidentId,
        eventType: "AUTOMATION_SUCCEEDED",
        message: `Automatisierung "${action.action}" erfolgreich abgeschlossen`,
        metadata: { automationActionId: action.id, action: action.action, executionId: finalExecution.id },
      });
    }
    return finalExecution;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    logger.error("Automatisierungs-Ausfuehrung fehlgeschlagen", { actionId: action.id, action: action.action, error: message });
    await log("ERROR", message);

    const finished = await markExecutionFinished(execution.id, "FAILED", { error: message, exitCode: 1, stderr: message });
    const finalExecution = finished ?? runningExecution;

    broadcast(createEvent(RealtimeEventType.AUTOMATION_FAILED, { action, execution: finalExecution }));
    void dispatchWebhookEvent("AUTOMATION_FAILED", { action, execution: finalExecution });
    if (options.selfHealing) {
      broadcast(createEvent(RealtimeEventType.SELF_HEALING_FAILED, { action, execution: finalExecution }));
    }
    if (action.incidentId !== null) {
      // Auftragspunkt 10 "keine Secrets in Timeline/Audit" - `message`
      // stammt aus einer gefangenen JS-Error-Message der eigenen
      // Ausfuehrungslogik (safe-action-runner.ts), niemals aus Nutzereingabe
      // oder einem Secret-Wert.
      void addTimelineEvent({
        incidentId: action.incidentId,
        eventType: "AUTOMATION_FAILED",
        message: `Automatisierung "${action.action}" fehlgeschlagen: ${message}`,
        metadata: { automationActionId: action.id, action: action.action, executionId: finalExecution.id },
      });
    }
    return finalExecution;
  }
}
