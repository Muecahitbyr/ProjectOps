import {
  createRootIncident,
  getOpenRootIncidentForCheckType,
  getUncorrelatedOpenIncidents,
  linkIncidentsToRootIncident,
  resolveCompletedRootIncidents,
  type CandidateIncidentRow,
} from "../db/root-incidents.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { logger } from "../core/logger";
import { getProjectName } from "../config/projects.config";
import { dispatchNotificationEvent } from "../notifications/notification-event.service";
import { evaluateAutomationTriggers } from "../automation/automation-engine";

// Auftragspunkt 7 "Incident Correlation" - regelbasiert, keine KI: mehrere
// aktuell offene Incidents zaehlen als korreliert, wenn sie
//   (a) auf Checks desselben Typs beruhen ("gleiche Fehlerquelle"),
//   (b) mindestens zwei verschiedene Projekte betreffen,
//   (c) innerhalb desselben kurzen Zeitfensters entstanden sind.
const CORRELATION_WINDOW_MINUTES = 15;
const MIN_PROJECTS_FOR_CORRELATION = 2;

function groupByCheckType(rows: CandidateIncidentRow[]): Map<string, CandidateIncidentRow[]> {
  const byType = new Map<string, CandidateIncidentRow[]>();
  for (const row of rows) {
    const list = byType.get(row.check_type) ?? [];
    list.push(row);
    byType.set(row.check_type, list);
  }
  return byType;
}

// Wird einmal je vollstaendigem Scheduler-Durchlauf aufgerufen (core/
// monitor.ts, nach allen Projekten) - Korrelation ist projektuebergreifend
// und ergibt pro Projekt einzeln keinen Sinn.
export async function correlateIncidents(): Promise<void> {
  const candidates = await getUncorrelatedOpenIncidents();
  if (candidates.length === 0) return;

  const byCheckType = groupByCheckType(candidates);

  for (const [checkType, rows] of byCheckType) {
    const distinctProjectIds = [...new Set(rows.map((row) => row.project_id))];
    if (distinctProjectIds.length < MIN_PROJECTS_FOR_CORRELATION) {
      continue;
    }

    const earliest = rows[0]?.created_at;
    const latest = rows[rows.length - 1]?.created_at;
    if (!earliest || !latest) continue;
    const spanMinutes = (new Date(latest).getTime() - new Date(earliest).getTime()) / 60_000;
    if (spanMinutes > CORRELATION_WINDOW_MINUTES) {
      // Nicht alle Kandidaten liegen im selben Zeitfenster - konservativ
      // ueberspringen statt eine falsche Gruppierung zu erzwingen. Beim
      // naechsten Tick wird erneut geprueft.
      continue;
    }

    let existingRoot = await getOpenRootIncidentForCheckType(checkType);
    const isNew = existingRoot === undefined;
    const rootIncidentId = existingRoot
      ? existingRoot.id
      : await createRootIncident(
          `${checkType}-Ausfall betrifft ${distinctProjectIds.length} Projekte`,
          checkType,
          earliest,
        );

    await linkIncidentsToRootIncident(
      rootIncidentId,
      rows.map((row) => row.incident_id),
    );

    logger.warn("Incidents korreliert", { rootIncidentId, checkType, projects: distinctProjectIds, isNew });

    broadcast(
      createEvent(RealtimeEventType.INCIDENT_CORRELATED, {
        rootIncidentId,
        causeCheckType: checkType,
        affectedProjectIds: distinctProjectIds,
        isNew,
      }),
    );

    // Nur bei einem neu eroeffneten Root-Incident benachrichtigen (nicht bei
    // jedem weiteren Incident, der einem bereits bekannten Root-Incident
    // zugeordnet wird) - je betroffenem Projekt ein Event, da NotificationEvent
    // genau eine projectId traegt.
    if (isNew) {
      for (const affectedProjectId of distinctProjectIds) {
        await dispatchNotificationEvent({
          type: "ROOT_INCIDENT_OPENED",
          projectId: affectedProjectId,
          projectName: getProjectName(affectedProjectId),
          severity: "CRITICAL",
          title: `Root-Incident erkannt: ${checkType}`,
          message: `Ein ${checkType}-Ausfall betrifft ${distinctProjectIds.length} Projekte gleichzeitig (${distinctProjectIds.map(getProjectName).join(", ")}).`,
          timestamp: new Date().toISOString(),
          metadata: { rootIncidentId, causeCheckType: checkType, affectedProjectIds: distinctProjectIds },
        });
        await evaluateAutomationTriggers("ROOT_INCIDENT_CREATED", affectedProjectId, {
          rootIncidentId,
          causeCheckType: checkType,
          severity: "CRITICAL",
        });
      }
    }
  }

  await resolveCompletedRootIncidents();
}
