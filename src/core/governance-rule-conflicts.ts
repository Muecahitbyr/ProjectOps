// Phase 61 "Enterprise Operational Governance Optimization" - Bestandsanalyse:
// automation/automation-engine.ts#evaluateAutomationTriggers() (Phase 9-11)
// laedt ALLE aktivierten, zu (Projekt, Trigger) passenden Regeln (bereits
// nach priority sortiert, siehe db/automation-rules.repository.ts) und
// verarbeitet sie in einer Schleife UNABHAENGIG voneinander - `priority`
// bestimmt nur die Reihenfolge, nicht ob nur EINE Regel gewinnt. Zwei
// aktivierte Regeln fuer denselben Trigger wuerden beim naechsten
// passenden Ereignis BEIDE ausgeloest:
//   - unterschiedliche Aktionen = WIDERSPRUECHLICHE Governance (z.B. eine
//     Regel restart-t automatisch, eine andere erwartet eine manuelle
//     Freigabe fuer eine andere Aktion am selben Ereignis).
//   - identische Aktion = UEBERFLUESSIGE Governance (dieselbe Aktion wird
//     zweimal fuer ein einzelnes Ereignis ausgeloest).
// Reine Lese-Diagnose ueber bereits bestehende Daten (automation_rules,
// Phase 9/17/40) - KEIN neues Engine, KEINE Verhaltensaenderung an
// evaluateAutomationTriggers() selbst, keine neue Persistenz.
import { listAutomationRules } from "../db/automation-rules.repository";
import type { AutomationRule } from "../types/automation.types";
import type { AutomationRuleConflict, GovernanceConflictingRule } from "../types/governance.types";

function toConflictingRule(rule: AutomationRule): GovernanceConflictingRule {
  return { ruleId: rule.id, name: rule.name, action: rule.action, autoExecute: rule.autoExecute, approvalRequired: rule.approvalRequired, priority: rule.priority };
}

export async function detectAutomationRuleConflicts(projectId: string): Promise<AutomationRuleConflict[]> {
  const rules = await listAutomationRules({ projectId, enabledOnly: true });

  const byTrigger = new Map<AutomationRule["trigger"], AutomationRule[]>();
  for (const rule of rules) {
    const group = byTrigger.get(rule.trigger) ?? [];
    group.push(rule);
    byTrigger.set(rule.trigger, group);
  }

  const conflicts: AutomationRuleConflict[] = [];
  for (const [trigger, group] of byTrigger) {
    if (group.length < 2) continue;
    const distinctActions = new Set(group.map((r) => r.action));
    conflicts.push({
      trigger,
      kind: distinctActions.size > 1 ? "CONTRADICTORY_ACTIONS" : "REDUNDANT_DUPLICATE",
      rules: group.map(toConflictingRule),
    });
  }

  return conflicts.sort((a, b) => a.trigger.localeCompare(b.trigger));
}
