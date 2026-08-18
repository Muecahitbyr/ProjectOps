import { useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { PageContainer } from "../components/layout/PageContainer";
import { AnalyticsTabs } from "../components/analytics/AnalyticsTabs";
import { IncidentHeatmap } from "../components/analytics/IncidentHeatmap";
import { WeekdayChart } from "../components/analytics/WeekdayChart";
import { SeverityDistributionChart } from "../components/analytics/SeverityDistributionChart";
import { FrequencyList } from "../components/analytics/FrequencyList";
import { IncidentDurationStatsGrid } from "../components/analytics/IncidentDurationStatsGrid";
import { DrillDownDialog } from "../components/analytics/DrillDownDialog";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useIncidentAnalytics } from "../hooks/useAnalytics";
import { useProjectsHealth } from "../hooks/useProjects";
import { getErrorMessage } from "../utils/getErrorMessage";
import type { HeatmapCell } from "../types/analytics.types";
import type { DrillDownFilters } from "../types/analytics.types";

const HOURS_OPTIONS = [
  { value: 24 * 7, label: "Last 7d" },
  { value: 24 * 30, label: "Last 30d" },
  { value: 24 * 90, label: "Last 90d" },
];

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Auftragspunkt 4 ("Incident Analytics", eigene Route /analytics/incidents).
export function AnalyticsIncidents() {
  const [hours, setHours] = useState(24 * 30);
  const [projectId, setProjectId] = useState("");
  const [drillDownFilters, setDrillDownFilters] = useState<DrillDownFilters | null>(null);
  const projectsQuery = useProjectsHealth();

  const query = useIncidentAnalytics({ ...(projectId ? { projectId } : {}), hours });

  const handleHeatmapCellClick = (cell: HeatmapCell): void => {
    // created_at ist als UTC-Zeitstempel gespeichert - EXTRACT(DOW/HOUR ...)
    // im Backend wertet ebenfalls in UTC aus, daher hier bewusst mit
    // Date.UTC statt lokaler Zeit rekonstruiert (sonst wuerde die
    // Drill-Down-Filterung in einer anderen Zeitzone als die Heatmap-Zelle
    // selbst liegen).
    const base = new Date();
    const dayDiff = (base.getUTCDay() - cell.weekday + 7) % 7;
    const cellStart = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - dayDiff, cell.hour, 0, 0));
    const cellEnd = new Date(cellStart.getTime() + 60 * 60 * 1000);
    setDrillDownFilters({
      ...(projectId ? { projectId } : {}),
      from: cellStart.toISOString(),
      to: cellEnd.toISOString(),
    });
  };

  return (
    <PageContainer title="Incident Analytics">
      <AnalyticsTabs />

      <Stack direction="row" sx={{ justifyContent: "flex-end", gap: 2, mb: 3 }}>
        <TextField select label="Project" size="small" value={projectId} onChange={(event) => setProjectId(event.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">All projects</MenuItem>
          {(projectsQuery.data ?? []).map((project) => (
            <MenuItem key={project.id} value={project.id}>
              {project.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Period" size="small" value={hours} onChange={(event) => setHours(Number(event.target.value))} sx={{ minWidth: 160 }}>
          {HOURS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {query.isLoading ? (
        <LoadingState label="Loading incident analytics..." minHeight={300} />
      ) : query.isError || !query.data ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={300} />
      ) : (
        <Stack sx={{ gap: 3 }}>
          <IncidentDurationStatsGrid stats={query.data.durationStats} mttdMs={query.data.mttdMs} />

          <Grid container spacing={2}>
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 1.5 }}>
                    Incidents per Hour (Heatmap)
                  </Typography>
                  <IncidentHeatmap cells={query.data.heatmap} onCellClick={handleHeatmapCellClick} />
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 1.5 }}>
                    Incidents per Weekday
                  </Typography>
                  <WeekdayChart entries={query.data.byWeekday} />
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 1.5 }}>
                    Severity Distribution
                  </Typography>
                  <SeverityDistributionChart distribution={query.data.severityDistribution} />
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 1.5 }}>
                    Top Affected Projects
                  </Typography>
                  <FrequencyList entries={query.data.topAffectedProjects} emptyMessage="No incidents in this period." />
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 1.5 }}>
                    Top Causes
                  </Typography>
                  <FrequencyList entries={query.data.topCauses} emptyMessage="No incidents in this period." />
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Stack>
      )}

      {drillDownFilters ? (
        <DrillDownDialog
          open={drillDownFilters !== null}
          onClose={() => setDrillDownFilters(null)}
          title={`Incidents · ${drillDownFilters.from ? (WEEKDAY_NAMES[new Date(drillDownFilters.from).getUTCDay()] ?? "") : ""}`}
          filters={drillDownFilters}
        />
      ) : null}
    </PageContainer>
  );
}
