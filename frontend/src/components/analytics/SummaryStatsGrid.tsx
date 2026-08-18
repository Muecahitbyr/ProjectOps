import Grid from "@mui/material/Grid";
import { StatsCard } from "../dashboard/StatsCard";
import { formatDuration, formatPercent, formatResponseTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import type { AnalyticsSummary } from "../../types/analytics.types";

interface SummaryStatsGridProps {
  summary: AnalyticsSummary;
}

// Alle in Auftragspunkt 1 aufgelisteten Kennzahlen ausser den Top-10-Listen
// und Haeufigkeits-Verteilungen (siehe TopProjectsList/FrequencyList) - die
// bekommen eigene Karten, da sie Listen statt einzelner Werte sind.
export function SummaryStatsGrid({ summary }: SummaryStatsGridProps) {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 6, sm: 4, md: 3 }}>
        <StatsCard label="Avg Health Score" value={summary.avgHealthScore} accentColor={healthStatusColors.healthy} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 3 }}>
        <StatsCard label="Avg Response Time" value={formatResponseTime(summary.avgResponseTimeMs)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 3 }}>
        <StatsCard label="Availability 24h" value={formatPercent(summary.availability24h)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 3 }}>
        <StatsCard label="Availability 7d" value={formatPercent(summary.availability7d)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 3 }}>
        <StatsCard label="Availability 30d" value={formatPercent(summary.availability30d)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 3 }}>
        <StatsCard label="Total Incidents" value={summary.incidents.total} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 3 }}>
        <StatsCard
          label="Open Incidents"
          value={summary.incidents.open}
          accentColor={summary.incidents.open > 0 ? healthStatusColors.warning : undefined}
        />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 3 }}>
        <StatsCard label="Resolved Incidents" value={summary.incidents.resolved} accentColor={healthStatusColors.healthy} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 3 }}>
        <StatsCard label="Avg Incident Duration" value={formatDuration(summary.avgIncidentDurationMs)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 3 }}>
        <StatsCard label="Avg Recovery Time (MTTR)" value={formatDuration(summary.avgRecoveryTimeMs)} />
      </Grid>
    </Grid>
  );
}
