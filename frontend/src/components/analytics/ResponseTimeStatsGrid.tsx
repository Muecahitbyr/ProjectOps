import Grid from "@mui/material/Grid";
import { StatsCard } from "../dashboard/StatsCard";
import { formatResponseTime } from "../../utils/formatters";
import type { ResponseTimeStats } from "../../types/analytics.types";

interface ResponseTimeStatsGridProps {
  stats: ResponseTimeStats;
}

export function ResponseTimeStatsGrid({ stats }: ResponseTimeStatsGridProps) {
  const entries: Array<{ label: string; value: number | null }> = [
    { label: "Average", value: stats.avgMs },
    { label: "Minimum", value: stats.minMs },
    { label: "Maximum", value: stats.maxMs },
    { label: "Median", value: stats.medianMs },
    { label: "P50", value: stats.p50Ms },
    { label: "P75", value: stats.p75Ms },
    { label: "P90", value: stats.p90Ms },
    { label: "P95", value: stats.p95Ms },
    { label: "P99", value: stats.p99Ms },
    { label: "Std. Deviation", value: stats.stddevMs },
  ];

  return (
    <Grid container spacing={2}>
      {entries.map((entry) => (
        <Grid key={entry.label} size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard label={entry.label} value={formatResponseTime(entry.value)} />
        </Grid>
      ))}
    </Grid>
  );
}
