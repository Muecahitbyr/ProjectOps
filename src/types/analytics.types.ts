import type { CheckStatus } from "./check-result.types";
import type { IncidentSeverity } from "./incident.types";

// Zeitraeume, die alle Analytics-Endpunkte akzeptieren (siehe
// resolveTimeWindow() in db/analytics.repository.ts). "custom" erfordert
// zusaetzlich from/to-Query-Parameter.
export type AnalyticsRange = "1h" | "24h" | "7d" | "30d" | "custom";

export interface IncidentDurationStats {
  count: number;
  avgDurationMs: number | null;
  mttrMs: number | null;
  mtbfMs: number | null;
  longestMs: number | null;
  shortestMs: number | null;
}

export interface RankedProject {
  projectId: string;
  projectName: string;
  healthScore: number;
  openIncidents: number;
  incidentsInWindow: number;
  criticalIncidentsInWindow: number;
  availability: number;
}

export interface FrequencyEntry {
  key: string;
  label: string;
  count: number;
}

export interface AnalyticsSummary {
  generatedAt: string;
  windowHours: number;
  avgHealthScore: number;
  avgResponseTimeMs: number | null;
  availability24h: number;
  availability7d: number;
  availability30d: number;
  incidents: {
    total: number;
    open: number;
    resolved: number;
  };
  avgIncidentDurationMs: number | null;
  avgRecoveryTimeMs: number | null;
  topCriticalProjects: RankedProject[];
  topStableProjects: RankedProject[];
  mostCommonErrorTypes: FrequencyEntry[];
  mostCommonIncidentCauses: FrequencyEntry[];
}

export interface HistoryBucket {
  bucketStart: string;
  healthScore: number | null;
  avgResponseTimeMs: number | null;
  minResponseTimeMs: number | null;
  maxResponseTimeMs: number | null;
  p25ResponseTimeMs: number | null;
  p75ResponseTimeMs: number | null;
  incidentCount: number;
  errorRate: number | null;
  availability: number | null;
  sampleCount: number;
}

export interface ProjectHistory {
  projectId: string;
  range: AnalyticsRange;
  from: string;
  to: string;
  bucketMinutes: number;
  buckets: HistoryBucket[];
}

export interface ProjectSla {
  projectId: string;
  windowHours: number;
  from: string;
  to: string;
  availabilityPercent: number;
  slaPercent: number;
  totalUptimeMs: number;
  totalDowntimeMs: number;
  outageCount: number;
  avgOutageDurationMs: number | null;
  longestOutageMs: number | null;
  shortestOutageMs: number | null;
  mttrMs: number | null;
  mtbfMs: number | null;
}

export interface HeatmapCell {
  weekday: number;
  hour: number;
  count: number;
}

export interface WeekdayEntry {
  weekday: number;
  count: number;
}

export interface IncidentAnalytics {
  windowHours: number;
  heatmap: HeatmapCell[];
  byWeekday: WeekdayEntry[];
  severityDistribution: Record<IncidentSeverity, number>;
  topAffectedProjects: FrequencyEntry[];
  topCauses: FrequencyEntry[];
  durationStats: IncidentDurationStats;
  mttdMs: number | null;
}

export interface ResponseTimeStats {
  count: number;
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  medianMs: number | null;
  p50Ms: number | null;
  p75Ms: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  stddevMs: number | null;
}

export interface ResponseTimeHistogramBucket {
  rangeStartMs: number;
  rangeEndMs: number;
  count: number;
}

export interface ResponseTimeAnalytics {
  windowHours: number;
  stats: ResponseTimeStats;
  histogram: ResponseTimeHistogramBucket[];
  series: HistoryBucket[];
}

export interface ProjectComparisonSide {
  projectId: string;
  projectName: string;
  healthScore: number;
  availabilityPercent: number;
  avgResponseTimeMs: number | null;
  incidents: { total: number; open: number; resolved: number };
  totalDowntimeMs: number;
  mttrMs: number | null;
  slaPercent: number;
  history: ProjectHistory;
}

export interface ProjectComparison {
  windowHours: number;
  a: ProjectComparisonSide;
  b: ProjectComparisonSide;
}

export interface DrillDownRow {
  timestamp: string;
  projectId: string;
  projectName: string;
  checkId: string;
  checkType: string;
  status: CheckStatus;
  responseTimeMs: number | null;
  health: "healthy" | "warning" | "critical";
  // BIGSERIAL - der pg-Treiber liefert diese Spalte als String (siehe
  // incident.types.ts), nicht als number.
  incidentId: string | null;
  incidentSeverity: IncidentSeverity | null;
}

export interface DrillDownFilters {
  projectId?: string;
  status?: CheckStatus;
  severity?: IncidentSeverity;
  checkType?: string;
  search?: string;
  from?: string;
  to?: string;
}

export interface DrillDownResult {
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
  items: DrillDownRow[];
}
