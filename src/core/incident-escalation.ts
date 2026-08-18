import {
  listIncidentsDueForEscalationCheck,
  markIncidentEscalationStepFired,
} from "../db/incidents.repository";
import {
  getEscalationPolicyById,
  listEscalationSteps,
  listEscalationStepsForPolicies,
} from "../db/escalation-policies.repository";
import { getOnCallScheduleById, listOnCallScheduleMembers, listOnCallOverridesInRange } from "../db/on-call.repository";
import { getUserById } from "../db/users.repository";
import { resolveCurrentOnCall } from "./on-call";
import { addTimelineEvent } from "../db/incident-timeline.repository";
import { recordAuditLog } from "./audit-log";
import { dispatchNotificationEvent } from "../notifications/notification-event.service";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { logger } from "./logger";
import type { Incident } from "../types/incident.types";
import type { EscalationPolicyStep, IncidentEscalationStatus } from "../types/escalation-policy.types";

// Phase 27 "Enterprise On-Call & Escalation Management" - laeuft im
// bestehenden 30s-Scheduler-Tick (core/monitor.ts), KEIN eigener
// setInterval (Auftragspunkt 5 "keine zweite Polling-Schleife"). Reine
// Auswertungsfunktion ohne eigenen Zustand ausser dem, was ohnehin in
// incidents.escalation_policy_id/last_escalated_step persistiert ist -
// ein Neustart des Prozesses verliert keinen Fortschritt (naechster Tick
// berechnet exakt denselben faelligen Zustand aus den Spalten neu, analog
// zu core/on-call.ts "wer ist gerade dran" - nie ein Zwischenzustand im
// Speicher).
// Exportiert fuer routes/incidents.routes.ts GET .../escalation (Auftrags-
// punkt "aktueller On-Call-Responder sichtbar") - dieselbe Aufloesung, kein
// zweiter Code-Pfad fuer denselben Zweck.
export async function resolveStepTarget(step: EscalationPolicyStep): Promise<{ userId: string; userName: string } | null> {
  if (step.targetType === "USER") {
    if (!step.targetUserId) return null;
    const user = await getUserById(step.targetUserId);
    return user ? { userId: user.id, userName: user.name } : null;
  }

  // ON_CALL_SCHEDULE - identische Aufloesung wie alerts/alert-evaluator.ts
  // #resolveOnCallForStep (Phase 24), hier fuer Incidents wiederverwendet
  // statt einer zweiten Implementierung derselben Rotationslogik.
  if (!step.targetScheduleId) return null;
  try {
    const schedule = await getOnCallScheduleById(step.targetScheduleId);
    if (!schedule) return null;
    const now = new Date();
    const [members, overrides] = await Promise.all([
      listOnCallScheduleMembers(schedule.id),
      listOnCallOverridesInRange(schedule.id, now, now),
    ]);
    const current = resolveCurrentOnCall(schedule.id, schedule, members, overrides, now);
    if (!current.userId) return null;
    const user = await getUserById(current.userId);
    return user ? { userId: user.id, userName: user.name } : null;
  } catch (err) {
    logger.error("On-Call-Aufloesung fuer Eskalationsstufe fehlgeschlagen", {
      targetScheduleId: step.targetScheduleId,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    });
    return null;
  }
}

// Phase 32 "Enterprise Incident Command Center & Operational Coordination" -
// extrahiert aus routes/incidents.routes.ts GET .../escalation (Phase 27),
// damit sowohl dieser bestehende Endpunkt als auch der neue Command-
// Overview-Endpunkt (core/incident-command.ts) exakt dieselbe Zusammen-
// setzung verwenden - keine zweite Kopie derselben Logik.
export async function getIncidentEscalationSummary(incident: Incident): Promise<IncidentEscalationStatus> {
  if (incident.escalationPolicyId === null) {
    return { policy: null, currentStepOrder: 0, currentTarget: null, nextStep: null };
  }

  const policy = await getEscalationPolicyById(incident.escalationPolicyId);
  const steps = await listEscalationSteps(incident.escalationPolicyId);
  const policyWithSteps = policy ? { ...policy, steps } : null;

  const currentStep = steps.find((s) => s.stepOrder === incident.lastEscalatedStep);
  const currentTarget = currentStep
    ? await resolveStepTarget(currentStep).then((t) =>
        t
          ? { stepOrder: currentStep.stepOrder, delayMinutes: currentStep.delayMinutes, targetType: currentStep.targetType, userId: t.userId, userName: t.userName }
          : { stepOrder: currentStep.stepOrder, delayMinutes: currentStep.delayMinutes, targetType: currentStep.targetType, userId: null, userName: null },
      )
    : null;

  const upcoming = steps.filter((s) => s.stepOrder > incident.lastEscalatedStep).sort((a, b) => a.stepOrder - b.stepOrder)[0];
  const nextStep =
    upcoming && !incident.resolved && incident.acknowledgedAt === null
      ? {
          stepOrder: upcoming.stepOrder,
          delayMinutes: upcoming.delayMinutes,
          dueAt: new Date(new Date(incident.createdAt).getTime() + upcoming.delayMinutes * 60_000).toISOString(),
        }
      : null;

  return { policy: policyWithSteps, currentStepOrder: incident.lastEscalatedStep, currentTarget, nextStep };
}

async function fireStep(incident: Incident, step: EscalationPolicyStep): Promise<void> {
  // Compare-and-Swap: nur EIN gleichzeitiger Aufruf gewinnt (Auftragspunkt
  // 12 "keine doppelten Eskalationsaktionen"). Schlaegt die CAS fehl (schon
  // weitergeschaltet, oder zwischenzeitlich acknowledged/resolved), wird
  // diese Stufe still uebersprungen - kein Fehler, kein doppeltes Event.
  const updated = await markIncidentEscalationStepFired(incident.id, step.stepOrder - 1, step.stepOrder);
  if (!updated) return;

  const target = await resolveStepTarget(step);
  const payload = {
    incidentId: incident.id,
    projectId: incident.projectId,
    escalationPolicyId: step.policyId,
    stepOrder: step.stepOrder,
    targetType: step.targetType,
    targetUserId: target?.userId ?? null,
    targetUserName: target?.userName ?? null,
  };

  // Zwei getrennte Zweige statt eines gemeinsamen RealtimeEventType-Werts:
  // createEvent() ist ueberladen pro Literal-Typ (siehe realtime/events.ts)
  // und narrowt bei einem Union-Wert nicht korrekt (dasselbe Muster wie in
  // middleware/api-key-auth.ts#notifyQuotaThreshold, Phase 19).
  if (step.stepOrder === 1) {
    broadcast(createEvent(RealtimeEventType.ONCALL_ESCALATION_STARTED, payload));
  } else {
    broadcast(createEvent(RealtimeEventType.ONCALL_ESCALATION_LEVEL_CHANGED, payload));
  }

  const targetSuffix = target ? ` Diensthabend: ${target.userName}.` : " Kein Diensthabender aufloesbar.";
  void dispatchNotificationEvent({
    type: "INCIDENT_ESCALATED",
    projectId: incident.projectId,
    projectName: incident.projectId,
    severity: incident.severity === "CRITICAL" ? "CRITICAL" : incident.severity === "HIGH" ? "HIGH" : "WARNING",
    title: `Incident eskaliert: ${incident.title}`,
    message: `Stufe ${step.stepOrder} ausgeloest fuer Incident #${incident.id} ("${incident.title}").${targetSuffix}`,
    timestamp: new Date().toISOString(),
    metadata: { incidentId: incident.id, escalationPolicyId: step.policyId, stepOrder: step.stepOrder, targetUserId: target?.userId ?? null },
  });

  void addTimelineEvent({
    incidentId: incident.id,
    eventType: "ALERT_TRIGGERED",
    message: target ? `Eskalationsstufe ${step.stepOrder} ausgeloest - Diensthabend: ${target.userName}` : `Eskalationsstufe ${step.stepOrder} ausgeloest`,
    metadata: { escalationPolicyId: step.policyId, stepOrder: step.stepOrder, targetUserId: target?.userId ?? null },
  });

  void recordAuditLog({
    action: "INCIDENT_ESCALATED",
    category: "ON_CALL",
    projectId: incident.projectId,
    message: `Incident #${incident.id} auf Eskalationsstufe ${step.stepOrder} weitergeschaltet`,
    metadata: { incidentId: incident.id, escalationPolicyId: step.policyId, stepOrder: step.stepOrder, targetUserId: target?.userId ?? null },
  });
}

// Auftragspunkt 4 "Resolve beendet laufende Eskalation" - EIN gemeinsamer
// Helper statt dreimal derselben Pruefung (core/monitor.ts automatische
// Wiederherstellung, routes/incidents.routes.ts und routes/v1/incidents.
// routes.ts manuelles Resolve). Feuert nur, wenn tatsaechlich eskaliert
// wurde (lastEscalatedStep > 0) - ein normal geloester Incident ohne
// jemals ausgeloeste Eskalation braucht kein "Eskalation beendet"-Signal.
// Kein neuer Code zum "Eskalation stoppen" noetig: der naechste
// evaluateIncidentEscalations()-Tick uebergeht bereits resolved=true
// eskalierte Incidents automatisch (WHERE resolved = false), dies hier ist
// nur das informative Realtime-Signal fuer bereits eskalierte Faelle.
export function broadcastEscalationResolvedIfNeeded(incident: Incident): void {
  if (incident.lastEscalatedStep <= 0 || incident.escalationPolicyId === null) return;
  broadcast(
    createEvent(RealtimeEventType.ONCALL_ESCALATION_RESOLVED, {
      incidentId: incident.id,
      projectId: incident.projectId,
      escalationPolicyId: incident.escalationPolicyId,
      finalStepOrder: incident.lastEscalatedStep,
    }),
  );
}

export async function evaluateIncidentEscalations(): Promise<void> {
  const candidates = await listIncidentsDueForEscalationCheck();
  if (candidates.length === 0) return;

  // Batch: EINE Abfrage fuer alle betroffenen Policies dieses Ticks statt
  // einer Abfrage pro Incident (Auftragspunkt 13 "keine N+1 Queries").
  const policyIds = [...new Set(candidates.map((i) => i.escalationPolicyId!).filter((id) => id !== null))];
  const stepsByPolicy = await listEscalationStepsForPolicies(policyIds);

  for (const incident of candidates) {
    const steps = stepsByPolicy.get(incident.escalationPolicyId!);
    if (!steps || steps.length === 0) continue;

    // enabled wird bewusst NICHT gecacht - eine deaktivierte Policy soll
    // sofort (naechster Tick) keine weiteren Stufen mehr feuern, ohne dass
    // bereits laufende Incidents das erst nach einem Neustart bemerken.
    const policy = await getEscalationPolicyById(incident.escalationPolicyId!);
    if (!policy || !policy.enabled) continue;

    const elapsedMinutes = (Date.now() - new Date(incident.createdAt).getTime()) / 60_000;
    const dueSteps = steps
      .filter((s) => s.stepOrder > incident.lastEscalatedStep && s.delayMinutes <= elapsedMinutes)
      .sort((a, b) => a.stepOrder - b.stepOrder);

    // Sequenziell (nicht Promise.all) - jede Stufe haengt vom CAS-Erfolg der
    // vorherigen ab (last_escalated_step muss Schritt fuer Schritt
    // aufsteigen, sonst koennte Stufe 3 vor Stufe 2 "gewinnen").
    for (const step of dueSteps) {
      await fireStep(incident, step);
    }
  }
}
