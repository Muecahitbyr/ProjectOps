import { Router } from "express";
import {
  getAutomationSuccessRate,
  getAverageApprovalTimeMs,
  getAverageExecutionDurationMs,
  getAutomationTrend,
  getExecutionHeatmap,
  getMostAutomatedProjects,
  getTopFailedActions,
  getTopTriggers,
} from "../db/automation-executions.repository";
import { authenticate } from "../middleware/authenticate";

export const automationAnalyticsRouter = Router();

// Teil 7 "Analytics Integration" - ein gebuendelter Endpunkt statt acht
// einzelner Roundtrips, da der Overview-/Analytics-Tab im Automation Center
// (Teil 3) alle diese Kennzahlen gleichzeitig braucht.
automationAnalyticsRouter.get("/automation-analytics", authenticate, async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;

  const [successRate, averageDurationMs, averageApprovalTimeMs, topTriggers, topFailedActions, mostAutomatedProjects, trend, heatmap] =
    await Promise.all([
      getAutomationSuccessRate(projectId),
      getAverageExecutionDurationMs(projectId),
      getAverageApprovalTimeMs(projectId),
      getTopTriggers(),
      getTopFailedActions(),
      getMostAutomatedProjects(),
      getAutomationTrend(),
      getExecutionHeatmap(),
    ]);

  res.json({
    successRate,
    averageDurationMs,
    averageApprovalTimeMs,
    topTriggers,
    topFailedActions,
    mostAutomatedProjects,
    trend,
    heatmap,
  });
});
