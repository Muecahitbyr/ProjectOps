import type { CheckType } from "../types/project.types";
import type { AutomationActionType } from "../types/automation.types";

// Deterministische Zuordnung Check-Typ -> plausibler Handlungsvorschlag
// (Auftragspunkt 9 "Self Healing Vorbereitung"). Keine Zufallsauswahl, keine
// KI - eine feste, nachvollziehbare Tabelle, damit jeder Vorschlag anhand
// des Check-Typs erklaerbar ist.
const SUGGESTION_BY_CHECK_TYPE: Record<CheckType, AutomationActionType> = {
  "firebase-status": "RESTART_SERVICE",
  firestore: "RESTART_SERVICE",
  "firebase-storage": "RESTART_SERVICE",
  stripe: "RESTART_SERVICE",
  "api-health": "RESTART_SERVICE",
  http: "RUN_HEALTH_CHECK",
  dns: "RUN_HEALTH_CHECK",
  ssl: "RUN_HEALTH_CHECK",
  "response-time": "CLEAR_CACHE",
  custom: "RUN_HEALTH_CHECK",
  // Phase 53 - reine Drittanbieter-/externe Statuspruefungen (kein eigener
  // "Service", der neugestartet werden koennte) - dieselbe Einordnung wie
  // http/dns/ssl.
  "stripe-status": "RUN_HEALTH_CHECK",
  countriesnow: "RUN_HEALTH_CHECK",
};

export function suggestAutomationAction(checkType: CheckType): AutomationActionType {
  return SUGGESTION_BY_CHECK_TYPE[checkType];
}
