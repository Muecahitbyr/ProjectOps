import type { AutomationAction, AutomationExecution, AutomationRule } from "../types/automation.types";
import type { AutomationBuildingStatus, AutomationCityBuildingData } from "../types/automation-city.types";

// Reine Transformationsfunktion (analog zu utils/cityMapper.ts) - nimmt die
// bereits von useCity() geladenen Automatisierungsdaten entgegen, keine
// eigenen API-Aufrufe.
function overallStatus(pendingApprovals: number, executions: AutomationExecution[]): AutomationBuildingStatus {
  if (executions.some((execution) => execution.status === "RUNNING")) return "running";
  if (pendingApprovals > 0) return "waiting_approval";
  const mostRecent = executions[0];
  if (mostRecent?.status === "FAILED") return "failed";
  if (mostRecent?.status === "SUCCESS") return "healthy";
  return "idle";
}

export function mapAutomationToCity(
  rules: AutomationRule[],
  pendingActions: AutomationAction[],
  recentExecutions: AutomationExecution[],
): AutomationCityBuildingData[] {
  const enabledRules = rules.filter((rule) => rule.enabled);
  const autoExecutions = recentExecutions.filter((execution) => execution.executedBy === null);

  const automationCenter: AutomationCityBuildingData = {
    id: "infra-automation-center",
    name: "Automation Center",
    type: "automation-center",
    status: overallStatus(pendingActions.length, recentExecutions),
    metrics: [
      { label: "Total rules", value: String(rules.length) },
      { label: "Active rules", value: String(enabledRules.length) },
      { label: "Pending approvals", value: String(pendingActions.length) },
    ],
  };

  const selfHealingUnit: AutomationCityBuildingData = {
    id: "infra-self-healing-unit",
    name: "Self Healing Unit",
    type: "self-healing-unit",
    status: overallStatus(0, autoExecutions),
    metrics: [
      { label: "Auto-executed", value: String(autoExecutions.length) },
      { label: "Successful", value: String(autoExecutions.filter((e) => e.status === "SUCCESS").length) },
      { label: "Failed", value: String(autoExecutions.filter((e) => e.status === "FAILED").length) },
    ],
  };

  const approvalOffice: AutomationCityBuildingData = {
    id: "infra-approval-office",
    name: "Approval Office",
    type: "approval-office",
    status: pendingActions.length > 0 ? "waiting_approval" : enabledRules.length > 0 ? "healthy" : "idle",
    metrics: [
      { label: "Pending", value: String(pendingActions.length) },
      { label: "Rules requiring approval", value: String(rules.filter((rule) => rule.approvalRequired).length) },
    ],
  };

  const robotFactory: AutomationCityBuildingData = {
    id: "infra-robot-factory",
    name: "Robot Factory",
    type: "robot-factory",
    status: rules.length === 0 ? "idle" : overallStatus(0, recentExecutions),
    metrics: [
      { label: "Total rules", value: String(rules.length) },
      { label: "Auto-execute enabled", value: String(rules.filter((rule) => rule.autoExecute).length) },
    ],
  };

  return [automationCenter, selfHealingUnit, approvalOffice, robotFactory];
}
