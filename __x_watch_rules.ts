import "dotenv/config";
import { pool } from "./src/db/pool";
const seen = new Set<number>();
async function poll() {
  const res = await pool.query(`
    SELECT aa.id as action_id, aa.rule_id, aa.project_id, aa.action, aa.status, aa.created_at,
           ae.id as exec_id, ae.status as exec_status, ae.error, ae.finished_at
    FROM automation_actions aa
    LEFT JOIN automation_executions ae ON ae.automation_action_id = aa.id
    WHERE aa.rule_id IN (80,81,82,83,84,85)
    ORDER BY aa.created_at ASC
  `);
  for (const row of res.rows) {
    if (seen.has(row.action_id)) continue;
    seen.add(row.action_id);
    console.log(`ACTION #${row.action_id} rule=${row.rule_id} project=${row.project_id} action=${row.action} status=${row.status} exec_status=${row.exec_status ?? "none"} error=${row.error ?? "-"}`);
  }
}
async function main() {
  const start = Date.now();
  while (Date.now() - start < 9 * 60 * 1000) {
    await poll();
    await new Promise((r) => setTimeout(r, 15000));
  }
  console.log("DONE_WATCHING");
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
