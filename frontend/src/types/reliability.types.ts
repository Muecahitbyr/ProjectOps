import type { FrequencyEntry, HeatmapCell, WeekdayEntry } from "./analytics.types";
import type { IncidentSeverity } from "./common.types";
import type { SloStatus } from "./slo.types";

// Phase 33 "Enterprise Reliability Intelligence & Incident Learning" -
// Spiegelt exakt die Antwortformen aus core/reliability-intelligence.ts
// (Backend). Reine Lese-Aggregation, keine eigenen Mutationstypen.
export type ReliabilityRange = "24h" | "7d" | "30d" | "90d";

export interface ReliabilityFilterParams {
  organizationId: string;
  range: ReliabilityRange;
  projectId?: string;
  severity?: IncidentSeverity;
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

export interface PostmortemLearningStats {
  resolvedIncidentsInWindow: number;
  incidentsWithPostmortem: number;
  incidentsMissingPostmortem: number;
  postmortemsByStatus: { draft: number; inReview: number; published: number };
  actionItems: { open: number; inProgress: number; done: number; overdue: number; total: number };
  avgActionItemsPerPostmortem: number | null;
}

export interface ReliabilityOverview {
  windowHours: number;
  organizationId: string;
  projectCount: number;
  summary: {
    openIncidents: number;
    highCriticalIncidents: number;
    resolvedIncidents: number;
    incidentsInWindow: number;
    mttaMs: number | null;
    mttrMs: number | null;
    mttdMs: number | null;
    avgRecoveryMs: number | null;
    incidentRatePerDay: number;
    repeatRate: number;
    affectedProjectCount: number;
  };
  severityDistribution: Record<IncidentSeverity, number>;
  topAffectedProjects: FrequencyEntry[];
  topCauses: FrequencyEntry[];
  changeCorrelation: ChangeCorrelationStats;
  postmortem: PostmortemLearningStats;
}

export interface IncidentDailyTrendPoint {
  day: string;
  total: number;
  high: number;
  critical: number;
}

export interface ReliabilityTrends {
  windowHours: number;
  dailyTrend: IncidentDailyTrendPoint[];
  byWeekday: WeekdayEntry[];
  heatmap: HeatmapCell[];
  severityDistribution: Record<IncidentSeverity, number>;
  topAffectedProjects: FrequencyEntry[];
  topCauses: FrequencyEntry[];
}

export interface ProjectReliabilityRow {
  projectId: string;
  projectName: string;
  healthScore: number;
  openIncidents: number;
  incidentCount: number;
  criticalIncidentCount: number;
  mttrMs: number | null;
  repeatIncidentCount: number;
  openPostmortemActionItems: number;
  changeCorrelationCount: number;
  sloCount: number;
  worstSloStatus: SloStatus | null;
  avgErrorBudgetRemainingPercent: number | null;
}

export interface RecurringIncidentGroup {
  checkId: string;
  checkType: string;
  projectId: string;
  projectName: string;
  incidentCount: number;
  criticalCount: number;
  lastIncidentAt: string;
}

export interface ReliabilityInsight {
  key: string;
  text: string;
}
