import { useParams } from "react-router-dom";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { PageContainer } from "../components/layout/PageContainer";
import { StatusBadge } from "../components/common/StatusBadge";
import { StatsCard } from "../components/dashboard/StatsCard";
import { IncidentList } from "../components/dashboard/IncidentList";
import { TimelineChart } from "../components/dashboard/TimelineChart";
import { ProjectMembersPanel } from "../components/users/ProjectMembersPanel";
import { DeploymentsPanel } from "../components/deployments/DeploymentsPanel";
import { AlertRuleList } from "../components/alerts/AlertRuleList";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useProjectDetail } from "../hooks/useProjects";
import { useTimeline } from "../hooks/useDashboard";
import { useAlertRules } from "../hooks/useAlerts";
import { useMaintenanceWindows } from "../hooks/useMaintenance";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime, formatPercent, formatRelativeTime, formatResponseTime } from "../utils/formatters";
import { checkStatusColor, healthStatusColors } from "../theme/statusColors";

export function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const projectId = id ?? "";

  const detailQuery = useProjectDetail(projectId);
  const timelineQuery = useTimeline({ projectId, hours: 24, limit: 300 });
  const alertsQuery = useAlertRules(projectId);
  const maintenanceQuery = useMaintenanceWindows(projectId);

  if (detailQuery.isLoading) {
    return (
      <PageContainer title="Project Details">
        <LoadingState label="Loading project..." minHeight={400} />
      </PageContainer>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <PageContainer title="Project Details">
        <ErrorState message={getErrorMessage(detailQuery.error)} onRetry={() => detailQuery.refetch()} />
      </PageContainer>
    );
  }

  const detail = detailQuery.data;

  return (
    <PageContainer title="Project Details">
      <Grid container spacing={3}>
        <Grid size={12}>
          <Card>
            <CardContent>
              <Stack
                direction="row"
                sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}
              >
                <Box>
                  <Typography variant="h1">{detail.project.name}</Typography>
                  {detail.project.description ? (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {detail.project.description}
                    </Typography>
                  ) : null}
                </Box>
                <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                  <Typography variant="body2" color="text.secondary">
                    Score <strong>{detail.health.score}</strong>/100
                  </Typography>
                  <StatusBadge status={detail.health.status} size="medium" />
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatsCard label="Availability 24h" value={formatPercent(detail.availability24h)} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatsCard label="Availability 7d" value={formatPercent(detail.availability7d)} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatsCard label="Avg Response" value={formatResponseTime(detail.averageResponseTimeMs)} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatsCard label="P95 Response" value={formatResponseTime(detail.p95ResponseTimeMs)} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatsCard label="Fastest" value={formatResponseTime(detail.fastestResponseTimeMs)} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatsCard label="Slowest" value={formatResponseTime(detail.slowestResponseTimeMs)} />
        </Grid>

        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 2 }}>
                Response Time - Last 24h
              </Typography>
              {timelineQuery.isLoading ? (
                <LoadingState minHeight={260} />
              ) : timelineQuery.isError ? (
                <ErrorState message={getErrorMessage(timelineQuery.error)} onRetry={() => timelineQuery.refetch()} />
              ) : (
                <TimelineChart points={timelineQuery.data?.items ?? []} />
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 1 }}>
                Checks
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Check</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Last Run</TableCell>
                      <TableCell align="right">Response Time</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.checks.map((check) => (
                      <TableRow key={check.id}>
                        <TableCell>
                          <Typography variant="body2">{check.id}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {check.type}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ color: check.status ? checkStatusColor(check.status) : "text.secondary" }}
                          >
                            {check.status ?? "NO DATA"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" title={formatDateTime(check.lastRun)}>
                            {formatRelativeTime(check.lastRun)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{formatResponseTime(check.responseTimeMs)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 1 }}>
                Recent Incidents
              </Typography>
              <IncidentList incidents={detail.recentIncidents} emptyMessage="No incidents for this project." />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 2 }}>
                Alert Rules
              </Typography>
              {alertsQuery.isLoading ? (
                <LoadingState minHeight={120} />
              ) : alertsQuery.isError ? (
                <ErrorState message={getErrorMessage(alertsQuery.error)} onRetry={() => alertsQuery.refetch()} minHeight={120} />
              ) : (
                <AlertRuleList rules={alertsQuery.data ?? []} projectNames={{ [projectId]: detail.project.name }} />
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 2 }}>
                Maintenance
              </Typography>
              {maintenanceQuery.isLoading ? (
                <LoadingState minHeight={120} />
              ) : maintenanceQuery.isError ? (
                <ErrorState message={getErrorMessage(maintenanceQuery.error)} onRetry={() => maintenanceQuery.refetch()} minHeight={120} />
              ) : !maintenanceQuery.data || maintenanceQuery.data.length === 0 ? (
                <EmptyState message="No maintenance windows for this project." minHeight={120} />
              ) : (
                <Stack sx={{ gap: 1.5 }}>
                  {maintenanceQuery.data.map((window) => (
                    <Stack key={window.id} sx={{ gap: 0.25 }}>
                      <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                        <Chip
                          size="small"
                          label={window.active ? "Active" : new Date(window.startsAt).getTime() > Date.now() ? "Upcoming" : "Ended"}
                          sx={{
                            backgroundColor: window.active ? `${healthStatusColors.warning}1f` : undefined,
                            color: window.active ? healthStatusColors.warning : undefined,
                          }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(window.startsAt)} &rarr; {formatDateTime(window.endsAt)}
                        </Typography>
                      </Stack>
                      <Typography variant="body2">{window.reason}</Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={12}>
          <Card>
            <CardContent>
              <DeploymentsPanel projectId={projectId} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 2 }}>
                Team
              </Typography>
              <ProjectMembersPanel projectId={projectId} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </PageContainer>
  );
}
