import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import { useTheme } from "@mui/material/styles";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { StatsCard } from "../components/dashboard/StatsCard";
import { SeverityDistributionChart } from "../components/analytics/SeverityDistributionChart";
import { useOrganizations } from "../hooks/useOrganizations";
import {
  useRecurringIncidents,
  useReliabilityInsights,
  useReliabilityOverview,
  useReliabilityProjects,
  useReliabilityTrends,
} from "../hooks/useReliability";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime, formatDuration } from "../utils/formatters";
import { healthStatusColors } from "../theme/statusColors";
import type { IncidentSeverity } from "../types/common.types";
import type { IncidentDailyTrendPoint, ReliabilityRange } from "../types/reliability.types";
import type { SloStatus } from "../types/slo.types";

const SLO_STATUS_COLORS: Record<SloStatus, string> = {
  HEALTHY: healthStatusColors.healthy,
  DEGRADED: healthStatusColors.warning,
  CRITICAL: healthStatusColors.critical,
};

const RANGE_OPTIONS: { value: ReliabilityRange; label: string }[] = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
  { value: "90d", label: "Last 90d" },
];

const SEVERITIES: IncidentSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function formatRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// Phase 33 "Enterprise Reliability Intelligence & Incident Learning"
// Auftragspunkt 16 "Frontend" - eigene, fokussierte Seite statt das
// bestehende Dashboard zu ueberladen. Alle 5 Abschnitte (Executive Summary/
// Trends/Reliability by Project/Recurring Incidents/Change Correlation/
// Postmortem Learning/Insights) rendern unabhaengig voneinander (eigener
// Ladezustand pro Karte) - eine langsame Abfrage blockiert nicht die
// uebrigen Abschnitte.
export function Reliability() {
  const navigate = useNavigate();
  const [organizationId, setOrganizationId] = useState("");
  const [range, setRange] = useState<ReliabilityRange>("7d");
  const [projectId, setProjectId] = useState("");
  const [severity, setSeverity] = useState<IncidentSeverity | "ALL">("ALL");

  const organizationsQuery = useOrganizations();

  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current) return;
    const firstOrg = organizationsQuery.data?.[0];
    if (firstOrg) {
      hasAutoSelected.current = true;
      setOrganizationId(firstOrg.id);
    }
  }, [organizationsQuery.data]);

  const baseParams = useMemo(
    () => ({
      organizationId,
      range,
      ...(severity !== "ALL" ? { severity } : {}),
    }),
    [organizationId, range, severity],
  );
  const filterParams = useMemo(() => ({ ...baseParams, ...(projectId ? { projectId } : {}) }), [baseParams, projectId]);

  const enabled = Boolean(organizationId);
  const overviewQuery = useReliabilityOverview(filterParams, enabled);
  const trendsQuery = useReliabilityTrends(filterParams, enabled);
  // Bewusst OHNE projectId-Filter: alleinige Datenquelle fuer die Projekt-
  // Dropdown-Filterliste (muss immer ALLE Projekte der Organisation
  // enthalten, unabhaengig vom aktuell gewaehlten Projekt-Filter).
  const projectOptionsQuery = useReliabilityProjects(baseParams, enabled);
  // Im Browser-Test gefunden: wird dieselbe (ungefilterte) Abfrage auch fuer
  // die "Reliability by Project"-Tabelle verwendet, ignoriert die Tabelle
  // den Projekt-Filter komplett (zeigt immer alle 4 Projekte, auch wenn nur
  // "Rechno" ausgewaehlt ist) - inkonsistent zu allen anderen Abschnitten
  // der Seite. Daher eine zweite, gefilterte Abfrage fuer die Tabelle selbst.
  const projectsQuery = useReliabilityProjects(filterParams, enabled);
  const recurringQuery = useRecurringIncidents(filterParams, enabled);
  const insightsQuery = useReliabilityInsights(filterParams, enabled);

  const summary = overviewQuery.data?.summary;

  return (
    <PageContainer title="Reliability">
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
            <TextField
              select
              size="small"
              label="Organization"
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value);
                setProjectId("");
              }}
              sx={{ minWidth: 200 }}
            >
              {(organizationsQuery.data ?? []).map((org) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Time range" value={range} onChange={(event) => setRange(event.target.value as ReliabilityRange)} sx={{ minWidth: 150 }}>
              {RANGE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="">All projects</MenuItem>
              {(projectOptionsQuery.data ?? []).map((project) => (
                <MenuItem key={project.projectId} value={project.projectId}>
                  {project.projectName}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Severity" value={severity} onChange={(event) => setSeverity(event.target.value as IncidentSeverity | "ALL")} sx={{ minWidth: 150 }}>
              <MenuItem value="ALL">All severities</MenuItem>
              {SEVERITIES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      {!organizationId ? (
        <EmptyState message="Select an organization to view its reliability data." minHeight={240} />
      ) : (
        <Stack sx={{ gap: 3 }}>
          <Section title="Executive Summary">
            {overviewQuery.isLoading ? (
              <LoadingState label="Loading overview..." minHeight={160} />
            ) : overviewQuery.isError ? (
              <ErrorState message={getErrorMessage(overviewQuery.error)} onRetry={() => overviewQuery.refetch()} minHeight={160} />
            ) : summary ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Open Incidents" value={summary.openIncidents} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="HIGH/CRITICAL" value={summary.highCriticalIncidents} accentColor={healthStatusColors.critical} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Incidents in Window" value={summary.incidentsInWindow} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Resolved" value={summary.resolvedIncidents} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Affected Projects" value={summary.affectedProjectCount} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Incident Rate / Day" value={summary.incidentRatePerDay} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Time to Acknowledge" value={formatDuration(summary.mttaMs)} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Time to Recovery" value={formatDuration(summary.avgRecoveryMs)} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Time to Resolve (MTTR)" value={formatDuration(summary.mttrMs)} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Time to Detect (MTTD)" value={formatDuration(summary.mttdMs)} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Repeat Rate" value={formatRate(summary.repeatRate)} />
                </Grid>
              </Grid>
            ) : (
              <EmptyState message="No overview data available." minHeight={160} />
            )}
          </Section>

          <Section title="Incident Trends">
            {trendsQuery.isLoading ? (
              <LoadingState label="Loading trends..." minHeight={220} />
            ) : trendsQuery.isError ? (
              <ErrorState message={getErrorMessage(trendsQuery.error)} onRetry={() => trendsQuery.refetch()} minHeight={220} />
            ) : trendsQuery.data ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 8 }}>
                  <IncidentDailyTrendChart points={trendsQuery.data.dailyTrend} />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <SeverityDistributionChart distribution={trendsQuery.data.severityDistribution} />
                </Grid>
              </Grid>
            ) : null}
          </Section>

          <Section title="Reliability by Project">
            {projectsQuery.isLoading ? (
              <LoadingState label="Loading projects..." minHeight={200} />
            ) : projectsQuery.isError ? (
              <ErrorState message={getErrorMessage(projectsQuery.error)} onRetry={() => projectsQuery.refetch()} minHeight={200} />
            ) : (projectsQuery.data ?? []).length === 0 ? (
              <EmptyState message="No projects in this organization." minHeight={200} />
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Project</TableCell>
                      <TableCell align="right">Health</TableCell>
                      <TableCell align="right">Incidents</TableCell>
                      <TableCell align="right">Critical</TableCell>
                      <TableCell align="right">MTTR</TableCell>
                      <TableCell align="right">Repeats</TableCell>
                      <TableCell align="right">Open Action Items</TableCell>
                      <TableCell align="right">Change-Correlated</TableCell>
                      <TableCell align="right">SLOs</TableCell>
                      <TableCell align="right">Error Budget</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(projectsQuery.data ?? []).map((row) => (
                      <TableRow key={row.projectId} hover>
                        <TableCell>{row.projectName}</TableCell>
                        <TableCell align="right">{row.healthScore}</TableCell>
                        <TableCell align="right">{row.incidentCount}</TableCell>
                        <TableCell align="right">{row.criticalIncidentCount}</TableCell>
                        <TableCell align="right">{formatDuration(row.mttrMs)}</TableCell>
                        <TableCell align="right">{row.repeatIncidentCount}</TableCell>
                        <TableCell align="right">{row.openPostmortemActionItems}</TableCell>
                        <TableCell align="right">{row.changeCorrelationCount}</TableCell>
                        <TableCell align="right">
                          {row.sloCount > 0 ? (
                            <Chip
                              size="small"
                              clickable
                              label={`${row.sloCount} · ${row.worstSloStatus ?? "PENDING"}`}
                              onClick={() => navigate(`/platform/slo?projectId=${row.projectId}`)}
                              sx={
                                row.worstSloStatus
                                  ? { backgroundColor: `${SLO_STATUS_COLORS[row.worstSloStatus]}1f`, color: SLO_STATUS_COLORS[row.worstSloStatus] }
                                  : undefined
                              }
                            />
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell align="right">{row.avgErrorBudgetRemainingPercent !== null ? `${row.avgErrorBudgetRemainingPercent}%` : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Section>

          <Section title="Recurring Incidents">
            {recurringQuery.isLoading ? (
              <LoadingState label="Loading recurring incidents..." minHeight={160} />
            ) : recurringQuery.isError ? (
              <ErrorState message={getErrorMessage(recurringQuery.error)} onRetry={() => recurringQuery.refetch()} minHeight={160} />
            ) : (recurringQuery.data ?? []).length === 0 ? (
              <EmptyState message="No recurring incident patterns in this period." minHeight={160} />
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Project</TableCell>
                      <TableCell>Check Type</TableCell>
                      <TableCell align="right">Incidents</TableCell>
                      <TableCell align="right">Critical</TableCell>
                      <TableCell>Last Incident</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(recurringQuery.data ?? []).map((group) => (
                      <TableRow key={`${group.checkId}-${group.projectId}`} hover>
                        <TableCell>{group.projectName}</TableCell>
                        <TableCell>{group.checkType}</TableCell>
                        <TableCell align="right">{group.incidentCount}</TableCell>
                        <TableCell align="right">{group.criticalCount}</TableCell>
                        <TableCell>{formatDateTime(group.lastIncidentAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Section>

          <Section title="Change Correlation">
            {overviewQuery.isLoading ? (
              <LoadingState label="Loading change correlation..." minHeight={160} />
            ) : overviewQuery.data ? (
              <Stack sx={{ gap: 2 }}>
                <Stack direction="row" sx={{ gap: 3, flexWrap: "wrap" }}>
                  <Typography variant="body2" color="text.secondary">
                    {overviewQuery.data.changeCorrelation.incidentsWithPrecedingChange} of {overviewQuery.data.changeCorrelation.totalIncidentsInWindow} incidents (
                    {formatRate(overviewQuery.data.changeCorrelation.correlationRate)}) followed a change within the correlation window.
                  </Typography>
                </Stack>
                {overviewQuery.data.changeCorrelation.topCorrelatedChanges.length === 0 ? (
                  <EmptyState message="No change-correlated incidents in this period." minHeight={100} />
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Change</TableCell>
                          <TableCell>Project</TableCell>
                          <TableCell align="right">Correlated Incidents</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {overviewQuery.data.changeCorrelation.topCorrelatedChanges.map((change) => (
                          <TableRow key={change.changeId} hover>
                            <TableCell>{change.changeTitle}</TableCell>
                            <TableCell>{change.projectName}</TableCell>
                            <TableCell align="right">{change.correlatedIncidentCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Stack>
            ) : null}
          </Section>

          <Section title="Postmortem Learning">
            {overviewQuery.isLoading ? (
              <LoadingState label="Loading postmortem learning..." minHeight={160} />
            ) : overviewQuery.data ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Resolved" value={overviewQuery.data.postmortem.resolvedIncidentsInWindow} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="With Postmortem" value={overviewQuery.data.postmortem.incidentsWithPostmortem} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Missing Postmortem" value={overviewQuery.data.postmortem.incidentsMissingPostmortem} accentColor={healthStatusColors.warning} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Open Action Items" value={overviewQuery.data.postmortem.actionItems.open + overviewQuery.data.postmortem.actionItems.inProgress} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Overdue Action Items" value={overviewQuery.data.postmortem.actionItems.overdue} accentColor={healthStatusColors.critical} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Avg Action Items / Postmortem" value={overviewQuery.data.postmortem.avgActionItemsPerPostmortem ?? "-"} />
                </Grid>
              </Grid>
            ) : null}
          </Section>

          <Section title="Incident Learning Insights">
            {insightsQuery.isLoading ? (
              <LoadingState label="Loading insights..." minHeight={120} />
            ) : insightsQuery.isError ? (
              <ErrorState message={getErrorMessage(insightsQuery.error)} onRetry={() => insightsQuery.refetch()} minHeight={120} />
            ) : (insightsQuery.data ?? []).length === 0 ? (
              <EmptyState message="Not enough data yet for reliability insights in this period." minHeight={120} />
            ) : (
              <Stack sx={{ gap: 1 }}>
                {(insightsQuery.data ?? []).map((insight) => (
                  <Alert key={insight.key} severity="info" variant="outlined">
                    {insight.text}
                  </Alert>
                ))}
              </Stack>
            )}
          </Section>
        </Stack>
      )}
    </PageContainer>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} slotProps={{ title: { variant: "h6" } }} />
      <CardContent sx={{ pt: 0 }}>{children}</CardContent>
    </Card>
  );
}

function IncidentDailyTrendChart({ points, height = 260 }: { points: IncidentDailyTrendPoint[]; height?: number }) {
  const theme = useTheme();

  if (points.length === 0) {
    return <EmptyState message="No incidents in this period." minHeight={height} />;
  }

  const data = points.map((point) => ({ ...point, label: new Date(point.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }));

  return (
    <Box sx={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="label" stroke={theme.palette.text.secondary} fontSize={12} />
          <YAxis stroke={theme.palette.text.secondary} fontSize={12} width={32} allowDecimals={false} />
          <Tooltip contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}` }} />
          <Line type="monotone" dataKey="total" name="Total" stroke={theme.palette.primary.main} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="high" name="High" stroke={healthStatusColors.warning} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="critical" name="Critical" stroke={healthStatusColors.critical} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
