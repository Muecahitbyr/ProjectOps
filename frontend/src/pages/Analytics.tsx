import { useMemo, useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { PageContainer } from "../components/layout/PageContainer";
import { ActiveMaintenanceBanner } from "../components/maintenance/ActiveMaintenanceBanner";
import { AnalyticsTabs } from "../components/analytics/AnalyticsTabs";
import { SummaryStatsGrid } from "../components/analytics/SummaryStatsGrid";
import { RankedProjectList } from "../components/analytics/RankedProjectList";
import { FrequencyList } from "../components/analytics/FrequencyList";
import { ProjectHistoryCharts } from "../components/analytics/ProjectHistoryCharts";
import { SlaSummaryGrid } from "../components/analytics/SlaSummaryGrid";
import { ResponseTimeStatsGrid } from "../components/analytics/ResponseTimeStatsGrid";
import { ResponseTimeHistogram } from "../components/analytics/ResponseTimeHistogram";
import { ResponseTimeBoxplotChart } from "../components/analytics/ResponseTimeBoxplotChart";
import { RangeSelector, type CustomRangeValue } from "../components/analytics/RangeSelector";
import { ExportMenu } from "../components/analytics/ExportMenu";
import { ObservabilityAnalyticsTab } from "../components/analytics/ObservabilityAnalyticsTab";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useAnalyticsSummary, useProjectSla, useResponseTimeAnalytics } from "../hooks/useAnalytics";
import { useProjectsHealth } from "../hooks/useProjects";
import { getErrorMessage } from "../utils/getErrorMessage";
import type { AnalyticsRange, RankedProject } from "../types/analytics.types";
import type { ExportColumn } from "../utils/export";

const HOURS_OPTIONS = [
  { value: 24, label: "Last 24h" },
  { value: 24 * 7, label: "Last 7d" },
  { value: 24 * 30, label: "Last 30d" },
  { value: 24 * 90, label: "Last 90d" },
];

const RANKED_PROJECT_COLUMNS: ExportColumn<RankedProject>[] = [
  { key: "projectName", label: "Project" },
  { key: "healthScore", label: "Health Score" },
  { key: "openIncidents", label: "Open Incidents" },
  { key: "incidentsInWindow", label: "Incidents (window)" },
  { key: "availability", label: "Availability (%)" },
];

function OverviewTab() {
  const [hours, setHours] = useState(24 * 30);
  const summaryQuery = useAnalyticsSummary({ hours });

  if (summaryQuery.isLoading) {
    return <LoadingState label="Loading analytics..." minHeight={300} />;
  }
  if (summaryQuery.isError || !summaryQuery.data) {
    return <ErrorState message={getErrorMessage(summaryQuery.error)} onRetry={() => summaryQuery.refetch()} minHeight={300} />;
  }

  const summary = summaryQuery.data;

  return (
    <Stack sx={{ gap: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <TextField select label="Period" size="small" value={hours} onChange={(event) => setHours(Number(event.target.value))} sx={{ minWidth: 160 }}>
          {HOURS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <SummaryStatsGrid summary={summary} />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                <Typography variant="h4">Top 10 Most Critical Projects</Typography>
                <ExportMenu data={summary.topCriticalProjects} columns={RANKED_PROJECT_COLUMNS} filename="top-critical-projects" title="Top Critical Projects" />
              </Stack>
              <RankedProjectList projects={summary.topCriticalProjects} emptyMessage="No critical projects in this period." />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                <Typography variant="h4">Top 10 Most Stable Projects</Typography>
                <ExportMenu data={summary.topStableProjects} columns={RANKED_PROJECT_COLUMNS} filename="top-stable-projects" title="Top Stable Projects" />
              </Stack>
              <RankedProjectList projects={summary.topStableProjects} emptyMessage="No data yet." />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1.5 }}>
                Most Common Error Types
              </Typography>
              <FrequencyList entries={summary.mostCommonErrorTypes} emptyMessage="No errors in this period." />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1.5 }}>
                Most Common Incident Causes
              </Typography>
              <FrequencyList entries={summary.mostCommonIncidentCauses} emptyMessage="No incidents in this period." />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}

function HistoryTab({ projectId }: { projectId: string }) {
  if (!projectId) {
    return <EmptyState message="Select a project above to see its historical charts." minHeight={200} />;
  }
  return <ProjectHistoryCharts projectId={projectId} />;
}

function SlaTab({ projectId }: { projectId: string }) {
  const [hours, setHours] = useState(24 * 30);
  const slaQuery = useProjectSla(projectId, hours);

  if (!projectId) {
    return <EmptyState message="Select a project above to see SLA & uptime metrics." minHeight={200} />;
  }
  if (slaQuery.isLoading) {
    return <LoadingState label="Loading SLA metrics..." minHeight={200} />;
  }
  if (slaQuery.isError || !slaQuery.data) {
    return <ErrorState message={getErrorMessage(slaQuery.error)} onRetry={() => slaQuery.refetch()} minHeight={200} />;
  }

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <TextField select label="Period" size="small" value={hours} onChange={(event) => setHours(Number(event.target.value))} sx={{ minWidth: 160 }}>
          {HOURS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <SlaSummaryGrid sla={slaQuery.data} />
    </Stack>
  );
}

function ResponseTimeTab({ projectId }: { projectId: string }) {
  const [range, setRange] = useState<AnalyticsRange>("24h");
  const [custom, setCustom] = useState<CustomRangeValue>({ from: "", to: "" });
  const params = useMemo(
    () => ({ ...(projectId ? { projectId } : {}), ...(range === "custom" ? { range, from: custom.from, to: custom.to } : { range }) }),
    [projectId, range, custom],
  );
  const query = useResponseTimeAnalytics(params);

  return (
    <Stack sx={{ gap: 2 }}>
      <RangeSelector range={range} onRangeChange={setRange} custom={custom} onCustomChange={setCustom} />

      {query.isLoading ? (
        <LoadingState label="Loading response time analytics..." minHeight={260} />
      ) : query.isError || !query.data ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={260} />
      ) : (
        <>
          <ResponseTimeStatsGrid stats={query.data.stats} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 1 }}>
                    Histogram
                  </Typography>
                  <ResponseTimeHistogram buckets={query.data.histogram} />
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 1 }}>
                    Distribution over time (Boxplot-style)
                  </Typography>
                  <ResponseTimeBoxplotChart buckets={query.data.series} />
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}
    </Stack>
  );
}

const SUB_TABS = ["overview", "history", "sla", "response-time", "observability"] as const;
type SubTab = (typeof SUB_TABS)[number];

export function Analytics() {
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [projectId, setProjectId] = useState("");
  const projectsQuery = useProjectsHealth();

  return (
    <PageContainer title="Analytics">
      <ActiveMaintenanceBanner />
      <AnalyticsTabs />

      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2, mb: 2 }}>
        <Tabs value={subTab} onChange={(_event, value: SubTab) => setSubTab(value)}>
          <Tab value="overview" label="Overview" />
          <Tab value="history" label="History" />
          <Tab value="sla" label="SLA & Uptime" />
          <Tab value="response-time" label="Response Time" />
          <Tab value="observability" label="Observability" />
        </Tabs>

        {subTab !== "overview" && subTab !== "observability" ? (
          <TextField
            select
            label="Project"
            size="small"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">All projects</MenuItem>
            {(projectsQuery.data ?? []).map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
      </Stack>

      {subTab === "overview" ? <OverviewTab /> : null}
      {subTab === "history" ? <HistoryTab projectId={projectId} /> : null}
      {subTab === "sla" ? <SlaTab projectId={projectId} /> : null}
      {subTab === "response-time" ? <ResponseTimeTab projectId={projectId} /> : null}
      {subTab === "observability" ? <ObservabilityAnalyticsTab /> : null}
    </PageContainer>
  );
}
