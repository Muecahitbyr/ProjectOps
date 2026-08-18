// Phase 33 "Enterprise Reliability Intelligence & Incident Learning" -
// AUSSCHLIESSLICH lesende SQL-Aggregationen ueber bereits bestehende
// Tabellen (incidents, incident_postmortems, incident_postmortem_action_items,
// automation_actions/automation_executions [Phase 30], changes/change_services/
// services [Phase 23/28/29]). Keine neue Tabelle, keine zweite Engine - siehe
// core/reliability-intelligence.ts fuer die Komposition. Jede Funktion hier
// deckt GENAU EINE Kennzahl/Gruppierung ab, die in src/db/analytics.repository.ts
// (Phase 19) noch nicht existiert (MTTA, Recovery-Zeit ueber Phase-30-
// Ausfuehrungen, Wiederholungsrate, Change-Korrelation, Postmortem-Learning) -
// alles andere (Incident-Trends/Heatmap/Severity/MTTR/MTBF/MTTD/Health Score)
// wird direkt wiederverwendet, siehe core/reliability-intelligence.ts.
import { pool } from "./pool";

export interface ReliabilityScope {
  // Bewusst PFLICHTFELD (nicht optional): core/reliability-intelligence.ts#
  // resolveScope() setzt dies IMMER (entweder auf ein einzelnes gefiltertes
  // Projekt oder auf alle Projekte der Organisation) - das ist zugleich die
  // Tenant-Isolationsgrenze (Auftragspunkt 14/19), ein Aufrufer kann sie nie
  // versehentlich weglassen.
  projectIds: string[];
  // Auftragspunkt 17 "Filter... Severity" - additiv zum bestehenden
  // Zeitraum-/Projekt-Filter.
  severity?: string;
  from: Date;
  to: Date;
}

// `prefix` (z.B. "i.") wird auf ALLE drei Incident-Spalten (created_at/
// project_id/severity) angewandt - notwendig, sobald incidents mit anderen
// Tabellen gejoint wird, die dieselben Spaltennamen tragen (siehe
// getPostmortemLearningStats: incident_postmortems/-action_items besitzen
// ebenfalls eine eigene created_at-Spalte, ein unqualifiziertes "created_at"
// waere dort mehrdeutig).
function scopeConditions(scope: ReliabilityScope, prefix = ""): { where: string; values: unknown[] } {
  const values: unknown[] = [scope.from.toISOString(), scope.to.toISOString()];
  const conditions = [`${prefix}created_at >= $1`, `${prefix}created_at < $2`];
  if (scope.projectIds !== undefined) {
    values.push(scope.projectIds);
    conditions.push(`${prefix}project_id = ANY($${values.length})`);
  }
  if (scope.severity !== undefined) {
    values.push(scope.severity);
    conditions.push(`${prefix}severity = $${values.length}`);
  }
  return { where: conditions.join(" AND "), values };
}

export interface IncidentDailyTrendPoint {
  day: string;
  total: number;
  high: number;
  critical: number;
}

// Auftragspunkt 5 "Incidents pro Tag/Woche" - analytics.repository.ts#
// getIncidentAnalytics() liefert bereits ein Wochentag x Stunde-Heatmap
// (WIEDERKEHRENDES Muster ueber die Woche), aber KEINE Kalendertag-
// Zeitreihe ueber den tatsaechlichen Datumsbereich - das ist die einzige
// echte Luecke fuer "Trends". Mirrort exakt dasselbe SQL-Muster wie
// db/automation-executions.repository.ts#getAutomationTrend (Phase 30),
// hier fuer incidents statt automation_executions.
export async function getIncidentDailyTrend(scope: ReliabilityScope): Promise<IncidentDailyTrendPoint[]> {
  const { where, values } = scopeConditions(scope);
  const { rows } = await pool.query<{ day: string; total: string; high: string; critical: string }>(
    `SELECT date_trunc('day', created_at)::date AS day,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE severity = 'HIGH') AS high,
            COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical
     FROM incidents WHERE ${where}
     GROUP BY day ORDER BY day`,
    values,
  );
  return rows.map((row) => ({ day: row.day, total: Number(row.total), high: Number(row.high), critical: Number(row.critical) }));
}

// Auftragspunkt 4A "durchschnittliche Time-to-Acknowledge" - fehlt in
// analytics.repository.ts (dort nur MTTR/MTBF/MTTD), einzige echte Luecke in
// den bestehenden Dauer-Kennzahlen.
export async function getMttaMs(scope: ReliabilityScope): Promise<number | null> {
  const { where, values } = scopeConditions(scope);
  const { rows } = await pool.query<{ avg_seconds: string | null }>(
    `SELECT AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at))) AS avg_seconds
     FROM incidents WHERE ${where} AND acknowledged_at IS NOT NULL`,
    values,
  );
  const value = rows[0]?.avg_seconds;
  return value === null || value === undefined ? null : Math.round(Number(value) * 1000);
}

export interface RecoveryStats {
  recoveryCount: number;
  avgRecoveryMs: number | null;
}

// Auftragspunkt 4B "durchschnittliche Time-to-Recovery" - bewusst
// UNTERSCHIEDEN von Time-to-Resolve (MTTR aus Phase 19: Zeit bis der
// Incident manuell/automatisch als resolved markiert wurde): Time-to-
// Recovery misst hier die Zeit bis zur ERSTEN ERFOLGREICHEN Phase-30-
// Recovery-Action-Ausfuehrung fuer den Incident - ein Incident kann erfolgreich
// "recovered" (Symptom behoben) sein, bevor er formal resolved wird.
// Wiederverwendet automation_actions/automation_executions (Phase 30) unveraendert,
// keine zweite Recovery-Engine.
export async function getRecoveryStats(scope: ReliabilityScope): Promise<RecoveryStats> {
  const { where, values } = scopeConditions(scope, "i.");
  const { rows } = await pool.query<{ count: string; avg_seconds: string | null }>(
    `SELECT COUNT(*) AS count, AVG(EXTRACT(EPOCH FROM (first_success.finished_at - i.created_at))) AS avg_seconds
     FROM incidents i
     JOIN LATERAL (
       SELECT ae.finished_at FROM automation_executions ae
       JOIN automation_actions aa ON aa.id = ae.automation_action_id
       WHERE aa.incident_id = i.id AND ae.status = 'SUCCESS' AND ae.finished_at IS NOT NULL
       ORDER BY ae.finished_at ASC LIMIT 1
     ) first_success ON true
     WHERE ${where}`,
    values,
  );
  const row = rows[0];
  const avg = row?.avg_seconds;
  return {
    recoveryCount: Number(row?.count ?? 0),
    avgRecoveryMs: avg === null || avg === undefined ? null : Math.round(Number(avg) * 1000),
  };
}

export interface RepeatIncidentStats {
  totalIncidents: number;
  repeatIncidents: number;
  repeatRate: number;
}

// Auftragspunkt 4 "Wiederholungsrate" - ein Incident gilt als "Wiederholung",
// wenn derselbe Check innerhalb desselben Zeitraums bereits einen FRUEHEREN
// Incident hatte (ROW_NUMBER-Fenster, eine einzige SQL-Abfrage, kein N+1).
export async function getRepeatIncidentStats(scope: ReliabilityScope): Promise<RepeatIncidentStats> {
  const { where, values } = scopeConditions(scope);
  const { rows } = await pool.query<{ total: string; repeats: string }>(
    `WITH ranked AS (
       SELECT id, check_id, ROW_NUMBER() OVER (PARTITION BY check_id ORDER BY created_at) AS rn
       FROM incidents WHERE ${where}
     )
     SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE rn > 1) AS repeats FROM ranked`,
    values,
  );
  const total = Number(rows[0]?.total ?? 0);
  const repeats = Number(rows[0]?.repeats ?? 0);
  return { totalIncidents: total, repeatIncidents: repeats, repeatRate: total > 0 ? Number((repeats / total).toFixed(4)) : 0 };
}

export interface RecurringIncidentGroup {
  checkId: string;
  checkType: string;
  projectId: string;
  projectName: string;
  incidentCount: number;
  criticalCount: number;
  firstIncidentAt: string;
  lastIncidentAt: string;
  // Phase 35 "Enterprise Problem Management & Root-Cause Intelligence"
  // Auftragspunkt 11 "Problem Candidates" - additiv ergaenzt (firstIncidentAt/
  // avgMttrMs), damit Problem-Kandidaten dieselbe, bereits bestehende
  // Phase-33-Aggregation wiederverwenden koennen statt einer zweiten
  // Recurring-Incident-Abfrage. Bestehende Aufrufer (Phase 33 Reliability
  // Intelligence) nutzen weiterhin nur die urspruenglichen Felder.
  avgMttrMs: number | null;
}

// Auftragspunkt 6 "Recurring Incident Intelligence" - deterministische
// Gruppierung nach (Check, Projekt) mit Mindesthaeufigkeit, keine KI/Heuristik.
export async function getRecurringIncidentGroups(scope: ReliabilityScope, minCount: number, limit: number): Promise<RecurringIncidentGroup[]> {
  const { where, values } = scopeConditions(scope, "i.");
  values.push(minCount);
  const minCountIndex = values.length;
  values.push(limit);
  const limitIndex = values.length;
  const { rows } = await pool.query<{
    check_id: string;
    check_type: string;
    project_id: string;
    project_name: string;
    incident_count: string;
    critical_count: string;
    first_incident_at: string | Date;
    last_incident_at: string | Date;
    avg_mttr_seconds: string | null;
  }>(
    `SELECT i.check_id, c.type AS check_type, i.project_id, p.name AS project_name,
            COUNT(*) AS incident_count,
            COUNT(*) FILTER (WHERE i.severity = 'CRITICAL') AS critical_count,
            MIN(i.created_at) AS first_incident_at,
            MAX(i.created_at) AS last_incident_at,
            AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at))) FILTER (WHERE i.resolved) AS avg_mttr_seconds
     FROM incidents i
     JOIN checks c ON c.id = i.check_id
     JOIN projects p ON p.id = i.project_id
     WHERE ${where}
     GROUP BY i.check_id, c.type, i.project_id, p.name
     HAVING COUNT(*) >= $${minCountIndex}
     ORDER BY incident_count DESC
     LIMIT $${limitIndex}`,
    values,
  );
  return rows.map((row) => ({
    checkId: row.check_id,
    checkType: row.check_type,
    projectId: row.project_id,
    projectName: row.project_name,
    incidentCount: Number(row.incident_count),
    criticalCount: Number(row.critical_count),
    firstIncidentAt: row.first_incident_at instanceof Date ? row.first_incident_at.toISOString() : row.first_incident_at,
    lastIncidentAt: row.last_incident_at instanceof Date ? row.last_incident_at.toISOString() : row.last_incident_at,
    avgMttrMs: row.avg_mttr_seconds !== null && row.avg_mttr_seconds !== undefined ? Math.round(Number(row.avg_mttr_seconds) * 1000) : null,
  }));
}

export interface ChangeCorrelationEntry {
  changeId: number;
  changeTitle: string;
  projectId: string;
  projectName: string;
  correlatedIncidentCount: number;
}

export interface ChangeCorrelationStats {
  totalIncidentsInWindow: number;
  incidentsWithPrecedingChange: number;
  correlationRate: number;
  topCorrelatedChanges: ChangeCorrelationEntry[];
}

// Auftragspunkt 7 "Change -> Incident Correlation" - EINE aggregierende
// SQL-Abfrage (kein analyzeChangeRisk()-Aufruf je historischer Kombination,
// siehe Auftrag: "nicht erneut fuer jede historische Kombination ausfuehren").
// Verknuepfung: changes -> change_services -> services (Phase 23/28/29,
// project_id) -> incidents desselben Projekts, deren created_at innerhalb
// [change-Start, change-Start + windowMinutes) liegt - dasselbe Zeitfenster-
// Prinzip wie die bestehende Change<->Incident-Korrelation (Phase 29/31),
// hier nur AGGREGIERT statt pro Incident einzeln aufgeloest.
export async function getChangeIncidentCorrelationStats(scope: ReliabilityScope, windowMinutes: number, limit: number): Promise<ChangeCorrelationStats> {
  const { where: incidentWhere, values: incidentValues } = scopeConditions(scope, "i.");

  const totalRes = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM incidents i WHERE ${incidentWhere}`, incidentValues);
  const totalIncidentsInWindow = Number(totalRes.rows[0]?.count ?? 0);

  const projectFilter = scope.projectIds !== undefined ? "AND i.project_id = ANY($5)" : "";
  const values: unknown[] = [scope.from.toISOString(), scope.to.toISOString(), windowMinutes, limit];
  if (scope.projectIds !== undefined) values.push(scope.projectIds);

  const { rows } = await pool.query<{
    change_id: number;
    change_title: string;
    project_id: string;
    project_name: string;
    correlated_incident_count: string;
  }>(
    `SELECT ch.id AS change_id, ch.title AS change_title, s.project_id, p.name AS project_name,
            COUNT(DISTINCT i.id) AS correlated_incident_count
     FROM changes ch
     JOIN change_services cs ON cs.change_id = ch.id
     JOIN services s ON s.id = cs.service_id AND s.project_id IS NOT NULL
     JOIN projects p ON p.id = s.project_id
     JOIN incidents i ON i.project_id = s.project_id
       AND i.created_at >= COALESCE(ch.actual_start_at, ch.planned_start_at, ch.created_at)
       AND i.created_at < COALESCE(ch.actual_start_at, ch.planned_start_at, ch.created_at) + ($3 || ' minutes')::interval
     WHERE i.created_at >= $1 AND i.created_at < $2 ${projectFilter}
     GROUP BY ch.id, ch.title, s.project_id, p.name
     ORDER BY correlated_incident_count DESC
     LIMIT $4`,
    values,
  );

  const topCorrelatedChanges = rows.map((row) => ({
    changeId: row.change_id,
    changeTitle: row.change_title,
    projectId: row.project_id,
    projectName: row.project_name,
    correlatedIncidentCount: Number(row.correlated_incident_count),
  }));

  // "wie viele Incidents hatten UEBERHAUPT einen vorausgehenden Change" -
  // EXISTS-Variante derselben Verknuepfung, ein zusaetzlicher, gezielter Query.
  const existsValues: unknown[] = [scope.from.toISOString(), scope.to.toISOString(), windowMinutes];
  const existsProjectFilter = scope.projectIds !== undefined ? "AND i.project_id = ANY($4)" : "";
  if (scope.projectIds !== undefined) existsValues.push(scope.projectIds);
  const withChangeRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM incidents i
     WHERE i.created_at >= $1 AND i.created_at < $2 ${existsProjectFilter}
       AND EXISTS (
         SELECT 1 FROM services s
         JOIN change_services cs ON cs.service_id = s.id
         JOIN changes ch ON ch.id = cs.change_id
         WHERE s.project_id = i.project_id
           AND i.created_at >= COALESCE(ch.actual_start_at, ch.planned_start_at, ch.created_at)
           AND i.created_at < COALESCE(ch.actual_start_at, ch.planned_start_at, ch.created_at) + ($3 || ' minutes')::interval
       )`,
    existsValues,
  );
  const incidentsWithPrecedingChange = Number(withChangeRes.rows[0]?.count ?? 0);

  return {
    totalIncidentsInWindow,
    incidentsWithPrecedingChange,
    correlationRate: totalIncidentsInWindow > 0 ? Number((incidentsWithPrecedingChange / totalIncidentsInWindow).toFixed(4)) : 0,
    topCorrelatedChanges,
  };
}

export interface PostmortemLearningStats {
  resolvedIncidentsInWindow: number;
  incidentsWithPostmortem: number;
  incidentsMissingPostmortem: number;
  postmortemsByStatus: { draft: number; inReview: number; published: number };
  actionItems: { open: number; inProgress: number; done: number; overdue: number; total: number };
  avgActionItemsPerPostmortem: number | null;
}

// Auftragspunkt 8 "Postmortem/Learning Intelligence" - reine Aggregation
// ueber die bestehenden Phase-26-Tabellen, keine neue Postmortem-Engine.
export async function getPostmortemLearningStats(scope: ReliabilityScope): Promise<PostmortemLearningStats> {
  // "i.created_at" explizit qualifiziert (nicht der scopeConditions()-
  // Default "created_at") - alle drei Abfragen unten joinen incidents mit
  // incident_postmortems/-action_items, die BEIDE ebenfalls eine eigene
  // created_at-Spalte besitzen. Ein unqualifiziertes "created_at" waere in
  // diesem Join mehrdeutig (Postgres-Fehler "column reference is ambiguous") -
  // beim Schreiben selbst bemerkt und hier bereits korrekt qualifiziert.
  const { where, values } = scopeConditions(scope, "i.");

  const resolvedRes = await pool.query<{ total: string; with_pm: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE pm.id IS NOT NULL) AS with_pm
     FROM incidents i
     LEFT JOIN incident_postmortems pm ON pm.incident_id = i.id
     WHERE ${where} AND i.resolved = true`,
    values,
  );
  const resolvedIncidentsInWindow = Number(resolvedRes.rows[0]?.total ?? 0);
  const incidentsWithPostmortem = Number(resolvedRes.rows[0]?.with_pm ?? 0);

  const statusRes = await pool.query<{ status: string; count: string }>(
    `SELECT pm.status, COUNT(*) AS count
     FROM incident_postmortems pm JOIN incidents i ON i.id = pm.incident_id
     WHERE ${where}
     GROUP BY pm.status`,
    values,
  );
  const postmortemsByStatus = { draft: 0, inReview: 0, published: 0 };
  for (const row of statusRes.rows) {
    if (row.status === "DRAFT") postmortemsByStatus.draft = Number(row.count);
    else if (row.status === "IN_REVIEW") postmortemsByStatus.inReview = Number(row.count);
    else if (row.status === "PUBLISHED") postmortemsByStatus.published = Number(row.count);
  }

  const itemsRes = await pool.query<{ status: string; overdue: string; count: string }>(
    `SELECT ai.status, COUNT(*) FILTER (WHERE ai.due_date IS NOT NULL AND ai.due_date < CURRENT_DATE AND ai.status <> 'DONE') AS overdue, COUNT(*) AS count
     FROM incident_postmortem_action_items ai
     JOIN incident_postmortems pm ON pm.id = ai.postmortem_id
     JOIN incidents i ON i.id = pm.incident_id
     WHERE ${where}
     GROUP BY ai.status`,
    values,
  );
  const actionItems = { open: 0, inProgress: 0, done: 0, overdue: 0, total: 0 };
  for (const row of itemsRes.rows) {
    const count = Number(row.count);
    actionItems.total += count;
    actionItems.overdue += Number(row.overdue);
    if (row.status === "OPEN") actionItems.open = count;
    else if (row.status === "IN_PROGRESS") actionItems.inProgress = count;
    else if (row.status === "DONE") actionItems.done = count;
  }

  const postmortemCount = postmortemsByStatus.draft + postmortemsByStatus.inReview + postmortemsByStatus.published;

  return {
    resolvedIncidentsInWindow,
    incidentsWithPostmortem,
    incidentsMissingPostmortem: Math.max(0, resolvedIncidentsInWindow - incidentsWithPostmortem),
    postmortemsByStatus,
    actionItems,
    avgActionItemsPerPostmortem: postmortemCount > 0 ? Number((actionItems.total / postmortemCount).toFixed(2)) : null,
  };
}

export interface ProjectReliabilityAggregates {
  incidentCountByProject: Map<string, number>;
  criticalCountByProject: Map<string, number>;
  mttrByProject: Map<string, number | null>;
  repeatCountByProject: Map<string, number>;
  openActionItemsByProject: Map<string, number>;
  changeCorrelationByProject: Map<string, number>;
}

// Auftragspunkt 10 "Reliability by Project" - fuenf GRUPPIERTE Abfragen
// (eine je Kennzahl-Familie, GROUP BY project_id), NICHT eine Abfrage pro
// Projekt in einer Schleife (Auftragspunkt 15 "kein N+1"). Health Score wird
// NICHT hier berechnet, sondern in core/reliability-intelligence.ts ueber
// die bestehende getAllProjectsHealth() (Phase 4/15) zusammengefuehrt.
export async function getProjectReliabilityAggregates(scope: ReliabilityScope): Promise<ProjectReliabilityAggregates> {
  const { where, values } = scopeConditions(scope);

  const [incidentRows, mttrRows, repeatRows, actionItemRows, changeRows] = await Promise.all([
    pool.query<{ project_id: string; total: string; critical: string }>(
      `SELECT project_id, COUNT(*) AS total, COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical
       FROM incidents WHERE ${where} GROUP BY project_id`,
      values,
    ),
    pool.query<{ project_id: string; avg_seconds: string | null }>(
      `SELECT project_id, AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved) AS avg_seconds
       FROM incidents WHERE ${where} GROUP BY project_id`,
      values,
    ),
    pool.query<{ project_id: string; repeats: string }>(
      `WITH ranked AS (
         SELECT project_id, check_id, ROW_NUMBER() OVER (PARTITION BY check_id ORDER BY created_at) AS rn
         FROM incidents WHERE ${where}
       )
       SELECT project_id, COUNT(*) FILTER (WHERE rn > 1) AS repeats FROM ranked GROUP BY project_id`,
      values,
    ),
    pool.query<{ project_id: string; open_count: string }>(
      `SELECT i.project_id, COUNT(*) AS open_count
       FROM incident_postmortem_action_items ai
       JOIN incident_postmortems pm ON pm.id = ai.postmortem_id
       JOIN incidents i ON i.id = pm.incident_id
       WHERE ${where.replaceAll("created_at", "i.created_at")} AND ai.status <> 'DONE'
       GROUP BY i.project_id`,
      values,
    ),
    (() => {
      const changeValues: unknown[] = [scope.from.toISOString(), scope.to.toISOString()];
      const changeProjectFilter = scope.projectIds !== undefined ? (changeValues.push(scope.projectIds), `AND i.project_id = ANY($${changeValues.length})`) : "";
      return pool.query<{ project_id: string; count: string }>(
        `SELECT s.project_id, COUNT(DISTINCT i.id) AS count
         FROM changes ch
         JOIN change_services cs ON cs.change_id = ch.id
         JOIN services s ON s.id = cs.service_id AND s.project_id IS NOT NULL
         JOIN incidents i ON i.project_id = s.project_id
           AND i.created_at >= COALESCE(ch.actual_start_at, ch.planned_start_at, ch.created_at)
           AND i.created_at < COALESCE(ch.actual_start_at, ch.planned_start_at, ch.created_at) + interval '240 minutes'
         WHERE i.created_at >= $1 AND i.created_at < $2 ${changeProjectFilter}
         GROUP BY s.project_id`,
        changeValues,
      );
    })(),
  ]);

  return {
    incidentCountByProject: new Map(incidentRows.rows.map((r) => [r.project_id, Number(r.total)])),
    criticalCountByProject: new Map(incidentRows.rows.map((r) => [r.project_id, Number(r.critical)])),
    mttrByProject: new Map(mttrRows.rows.map((r) => [r.project_id, r.avg_seconds === null ? null : Math.round(Number(r.avg_seconds) * 1000)])),
    repeatCountByProject: new Map(repeatRows.rows.map((r) => [r.project_id, Number(r.repeats)])),
    openActionItemsByProject: new Map(actionItemRows.rows.map((r) => [r.project_id, Number(r.open_count)])),
    changeCorrelationByProject: new Map(changeRows.rows.map((r) => [r.project_id, Number(r.count)])),
  };
}
