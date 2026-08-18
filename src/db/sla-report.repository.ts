import { pool } from "./pool";
import { getProjectSla } from "./analytics.repository";
import type { SlaReport } from "../types/sla-report.types";

export async function getSlaReport(projectId: string, hours: number): Promise<SlaReport | undefined> {
  const { rows: projectRows } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM projects WHERE id = $1`,
    [projectId],
  );
  const project = projectRows[0];
  if (!project) {
    return undefined;
  }

  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);

  const [sla, incidentRows, alertRows, automationRows] = await Promise.all([
    getProjectSla(projectId, hours),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM incidents WHERE project_id = $1 AND created_at >= $2 AND created_at < $3`,
      [projectId, from.toISOString(), to.toISOString()],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM alert_rules
       WHERE project_id = $1 AND last_triggered_at IS NOT NULL AND last_triggered_at >= $2 AND last_triggered_at < $3`,
      [projectId, from.toISOString(), to.toISOString()],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM automation_executions ae
       JOIN automation_actions aa ON aa.id = ae.automation_action_id
       WHERE aa.project_id = $1 AND ae.created_at >= $2 AND ae.created_at < $3`,
      [projectId, from.toISOString(), to.toISOString()],
    ),
  ]);

  return {
    projectId: project.id,
    projectName: project.name,
    sla,
    incidentCount: Number(incidentRows.rows[0]?.count ?? 0),
    alertTriggerCount: Number(alertRows.rows[0]?.count ?? 0),
    automationExecutionCount: Number(automationRows.rows[0]?.count ?? 0),
    generatedAt: new Date().toISOString(),
  };
}
