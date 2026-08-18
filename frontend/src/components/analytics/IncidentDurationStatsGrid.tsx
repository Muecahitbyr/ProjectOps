import Grid from "@mui/material/Grid";
import { StatsCard } from "../dashboard/StatsCard";
import { formatDuration } from "../../utils/formatters";
import type { IncidentDurationStats } from "../../types/analytics.types";

interface IncidentDurationStatsGridProps {
  stats: IncidentDurationStats;
  mttdMs: number | null;
}

export function IncidentDurationStatsGrid({ stats, mttdMs }: IncidentDurationStatsGridProps) {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <StatsCard label="Incidents" value={stats.count} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <StatsCard label="Avg Duration" value={formatDuration(stats.avgDurationMs)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <StatsCard label="MTTR" value={formatDuration(stats.mttrMs)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <StatsCard label="MTBF" value={formatDuration(stats.mtbfMs)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <StatsCard label="Mean Time To Detect" value={formatDuration(mttdMs)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <StatsCard label="Longest / Shortest" value={`${formatDuration(stats.longestMs)} / ${formatDuration(stats.shortestMs)}`} />
      </Grid>
    </Grid>
  );
}
