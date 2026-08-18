import Grid from "@mui/material/Grid";
import { StatsCard } from "../dashboard/StatsCard";
import { formatDuration, formatPercent } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import type { ProjectSla } from "../../types/analytics.types";

interface SlaSummaryGridProps {
  sla: ProjectSla;
}

// Alle in Auftragspunkt 3 ("SLA & Uptime") gelisteten Kennzahlen - siehe
// getProjectSla() in analytics.repository.ts fuer die Berechnung (u.a.
// PostgreSQL-Multiranges fuer ueberschneidungsfreie Downtime).
export function SlaSummaryGrid({ sla }: SlaSummaryGridProps) {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
        <StatsCard label="SLA" value={formatPercent(sla.slaPercent)} accentColor={healthStatusColors.healthy} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
        <StatsCard label="Availability" value={formatPercent(sla.availabilityPercent)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
        <StatsCard label="Total Uptime" value={formatDuration(sla.totalUptimeMs)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
        <StatsCard
          label="Total Downtime"
          value={formatDuration(sla.totalDowntimeMs)}
          accentColor={sla.totalDowntimeMs > 0 ? healthStatusColors.critical : undefined}
        />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
        <StatsCard label="Outages" value={sla.outageCount} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
        <StatsCard label="Avg Outage Duration" value={formatDuration(sla.avgOutageDurationMs)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
        <StatsCard label="Longest Outage" value={formatDuration(sla.longestOutageMs)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
        <StatsCard label="Shortest Outage" value={formatDuration(sla.shortestOutageMs)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
        <StatsCard label="MTTR" value={formatDuration(sla.mttrMs)} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
        <StatsCard label="MTBF" value={formatDuration(sla.mtbfMs)} />
      </Grid>
    </Grid>
  );
}
