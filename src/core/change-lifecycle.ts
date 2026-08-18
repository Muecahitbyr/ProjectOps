import { listServiceIdsForChange } from "../db/changes.repository";
import { getServicesByIds } from "../db/services.repository";
import { createMaintenanceWindowIfNoOverlap, endMaintenanceWindowNow, listMaintenanceWindows } from "../db/maintenance.repository";
import { AUTO_MAINTENANCE_WINDOW_FALLBACK_HOURS } from "../config/change-management.config";
import { logger } from "./logger";
import type { Change } from "../types/change.types";

// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk" - Architekturentscheidung "keine zweite Unterdrueckungs-Engine"
// (siehe Migrationskommentar 0051): ein startender Change erzeugt EIN
// ECHTES maintenance_windows-Fenster pro betroffenem Projekt (ueber die
// bestehende services-Tabelle aufgeloest) statt einer eigenen
// Unterdrueckungslogik in core/monitor.ts/alerts/alert-evaluator.ts. Beide
// Stellen pruefen bereits ausschliesslich getActiveMaintenanceWindow() -
// das automatisch erzeugte Fenster wird davon transparent mit abgedeckt,
// ohne dass monitor.ts/alert-evaluator.ts ueberhaupt angefasst werden
// mussten.
//
// Fire-and-forget-sicher: ein Fehler oder eine Ueberschneidung bei EINEM
// Projekt darf weder den Change-Start selbst verhindern noch die
// Fenstererzeugung fuer die UEBRIGEN betroffenen Projekte abbrechen -
// jedes Projekt wird unabhaengig versucht und geloggt.
export async function createMaintenanceWindowsForChangeStart(change: Change, actorUserId?: string): Promise<void> {
  const serviceIds = await listServiceIdsForChange(change.id);
  if (serviceIds.length === 0) return;

  const services = await getServicesByIds(serviceIds);
  const projectIds = [...new Set(services.map((s) => s.projectId).filter((p): p is string => p !== null))];
  if (projectIds.length === 0) return;

  const endsAt = change.plannedEndAt ?? new Date(Date.now() + AUTO_MAINTENANCE_WINDOW_FALLBACK_HOURS * 60 * 60 * 1000).toISOString();

  for (const projectId of projectIds) {
    try {
      const window = await createMaintenanceWindowIfNoOverlap({
        projectId,
        startsAt: new Date().toISOString(),
        endsAt,
        reason: `Change #${change.id}: ${change.title}`,
        ...(actorUserId ? { createdBy: actorUserId } : {}),
        changeId: change.id,
      });
      if (!window) {
        // Ueberschneidung mit einem bereits bestehenden Fenster - dieses
        // deckt die Unterdrueckung fuer den Zeitraum bereits ab, kein Fehler.
        logger.info("Automatisches Wartungsfenster fuer Change uebersprungen (bestehendes Fenster ueberschneidet sich bereits)", {
          changeId: change.id,
          projectId,
        });
      }
    } catch (err) {
      logger.error("Automatisches Wartungsfenster fuer Change konnte nicht angelegt werden", {
        changeId: change.id,
        projectId,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }
}

// Schliesst alle vom Change automatisch erzeugten, noch aktiven Fenster
// sofort (statt bis zum ggf. viel spaeteren Fallback-Ende zu warten), wenn
// der Change abgeschlossen oder abgebrochen wird - die Ueberwachung des
// betroffenen Projekts soll unmittelbar wieder normal reagieren.
export async function endMaintenanceWindowsForChange(changeId: number): Promise<void> {
  const windows = await listMaintenanceWindows({ changeId });
  for (const window of windows) {
    if (!window.active) continue;
    try {
      await endMaintenanceWindowNow(window.id);
    } catch (err) {
      logger.error("Automatisches Wartungsfenster fuer Change konnte nicht geschlossen werden", {
        changeId,
        maintenanceWindowId: window.id,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }
}
