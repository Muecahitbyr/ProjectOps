// Phase 61 "Enterprise Operational Governance Optimization" -
// Bestandsanalyse-Ergebnis: core/automation/automation-engine.ts#evaluateAutomationTriggers()
// (Phase 9-11) laedt ALLE aktivierten, zu (Projekt, Trigger) passenden
// Regeln (bereits nach priority sortiert) und verarbeitet JEDE davon
// unabhaengig - es gibt weder eine Deduplizierung noch eine Erkennung, ob
// zwei aktivierte Regeln fuer DENSELBEN Trigger WIDERSPRUECHLICHE (unter-
// schiedliche Aktionen) oder UEBERFLUESSIGE (identische Aktion) Konfigu-
// rationen darstellen - beide wuerden beim naechsten passenden Ereignis
// unabhaengig voneinander ausgeloest. Dieser Typ traegt AUSSCHLIESSLICH die
// dafuer noetige Erkennungs-/Anzeigestruktur - keine neue Automation-/
// Policy-Engine, keine Verhaltensaenderung an evaluateAutomationTriggers()
// selbst (reine Lese-Diagnose, siehe core/governance-rule-conflicts.ts).
import type { AutomationTrigger, AutomationActionType } from "./automation.types";

export type GovernanceRuleConflictKind = "CONTRADICTORY_ACTIONS" | "REDUNDANT_DUPLICATE";

export interface GovernanceConflictingRule {
  ruleId: number;
  name: string;
  action: AutomationActionType;
  autoExecute: boolean;
  approvalRequired: boolean;
  priority: number;
}

export interface AutomationRuleConflict {
  trigger: AutomationTrigger;
  kind: GovernanceRuleConflictKind;
  rules: GovernanceConflictingRule[];
}
