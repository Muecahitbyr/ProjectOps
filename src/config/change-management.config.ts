import type { ChangeRisk, ChangeType } from "../types/change.types";

// Phase 28 Auftragspunkt 7 "Change Approval" - "Die konkrete Regel soll
// sauber konfigurierbar sein und nicht hart an UI gekoppelt werden": eine
// einzelne, reine Funktion statt verstreuter if/else-Bloecke in Routen oder
// gar nur im Frontend geprueft - der Start-Endpunkt (routes/changes.
// routes.ts) ist die einzige durchsetzende Stelle, das Frontend zeigt nur
// den bereits vom Backend gelieferten approvalStatus an (nie eine eigene
// Kopie dieser Regel).
//
// Auftragspunkt 8 "Emergency Changes" - EMERGENCY umgeht die Freigabe IMMER,
// unabhaengig vom Risiko (siehe Auftrag: "duerfen den normalen
// Approval-Prozess umgehen"), muss dafuer aber eine Begruendung mitbringen
// (emergency_justification, per DB-CHECK-Constraint erzwungen - siehe
// Migration 0051) und wird vollstaendig auditiert.
export function isApprovalRequiredToStart(changeType: ChangeType, risk: ChangeRisk): boolean {
  if (changeType === "EMERGENCY") return false;
  return risk === "HIGH" || risk === "CRITICAL";
}

// Fallback-Dauer eines automatisch von einem Change erzeugten
// Wartungsfensters (core/change-lifecycle.ts), falls kein plannedEndAt
// gesetzt ist - ein Change darf nicht auf unbestimmte Zeit die
// Incident-/Alert-Erzeugung fuer sein Projekt unterdruecken.
export const AUTO_MAINTENANCE_WINDOW_FALLBACK_HOURS = 4;
