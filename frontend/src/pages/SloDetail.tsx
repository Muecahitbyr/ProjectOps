import { useState } from "react";
import { useParams } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Button from "@mui/material/Button";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { SloHistoryChart } from "../components/platform/SloHistoryChart";
import { useSlo, useSloHistory } from "../hooks/useSlo";
import { useProjectsHealth } from "../hooks/useProjects";
import { useIncidentAnalytics } from "../hooks/useAnalytics";
import { EditSloDialog } from "./SloOverview";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime, formatDuration } from "../utils/formatters";
import { healthStatusColors } from "../theme/statusColors";
import { SLI_TYPE_LABELS } from "../types/slo.types";
import type { SloHistoryWindow, SloStatus } from "../types/slo.types";

const SLO_STATUS_COLORS: Record<SloStatus, string> = {
  HEALTHY: healthStatusColors.healthy,
  DEGRADED: healthStatusColors.warning,
  CRITICAL: healthStatusColors.critical,
};

// Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service Health"
// Auftragspunkt 14 "SLO Detail" - Ziel/Aktuell/Compliance/Error Budget/
// Burn Rate/Status plus SLI-History-Chart ueber 1h/24h/7d/30d.
export function SloDetail() {
  const { id } = useParams<{ id: string }>();
  const [window, setWindow] = useState<SloHistoryWindow>("24h");
  const [editOpen, setEditOpen] = useState(false);

  const sloQuery = useSlo(id);
  const historyQuery = useSloHistory(id, window);
  const projectsQuery = useProjectsHealth();
  // Phase 34 Auftragspunkt 10 "SLO Details... Incident-Beitraege" -
  // wiederverwendet die bestehende Phase-19-Analytics (GET /analytics/incidents,
  // bereits `hours`-parametrisiert), keine neue Aggregation. Nur fuer
  // projektgebundene SLOs sinnvoll (organisationsweite API-SLIs haben kein
  // einzelnes Projekt).
  const incidentAnalyticsQuery = useIncidentAnalytics(
    sloQuery.data?.projectId ? { projectId: sloQuery.data.projectId, hours: sloQuery.data.windowDays * 24 } : {},
    Boolean(sloQuery.data?.projectId),
  );

  if (!id) {
    return (
      <PageContainer title="SLO">
        <ErrorState message="No SLO id provided." />
      </PageContainer>
    );
  }

  if (sloQuery.isLoading) {
    return (
      <PageContainer title="SLO">
        <LoadingState label="Loading SLO..." minHeight={300} />
      </PageContainer>
    );
  }

  if (sloQuery.isError || !sloQuery.data) {
    return (
      <PageContainer title="SLO">
        <ErrorState message={getErrorMessage(sloQuery.error)} onRetry={() => sloQuery.refetch()} />
      </PageContainer>
    );
  }

  const slo = sloQuery.data;
  const status = slo.current?.errorBudget.status ?? "PENDING";
  const projectName = slo.projectId ? (projectsQuery.data ?? []).find((p) => p.id === slo.projectId)?.name ?? slo.projectId : null;

  return (
    <PageContainer title={slo.name}>
      <Stack sx={{ gap: 3 }}>
        <Card>
          <CardContent>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 1 }}>
              <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Typography variant="h3">{slo.name}</Typography>
                <Chip size="small" label={SLI_TYPE_LABELS[slo.sliType]} variant="outlined" />
                <Chip
                  size="small"
                  label={status}
                  sx={status === "PENDING" ? {} : { backgroundColor: `${SLO_STATUS_COLORS[status as SloStatus]}1f`, color: SLO_STATUS_COLORS[status as SloStatus] }}
                />
                {!slo.enabled ? <Chip size="small" label="DISABLED" variant="outlined" /> : null}
              </Stack>
              <Button size="small" startIcon={<EditOutlinedIcon fontSize="small" />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            </Stack>
            {slo.description ? (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {slo.description}
              </Typography>
            ) : null}

            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Target
                </Typography>
                <Typography variant="body2">{slo.target}%</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Current SLI
                </Typography>
                <Typography variant="body2">{slo.current ? `${slo.current.sliValue}%` : "Pending first evaluation"}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Error Budget Remaining
                </Typography>
                <Typography variant="body2">{slo.current ? `${slo.current.errorBudget.remainingPercentOfBudget}%` : "-"}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Burn Rate
                </Typography>
                <Typography variant="body2">{slo.current ? `${slo.current.errorBudget.burnRate}x` : "-"}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Error Budget (time)
                </Typography>
                <Typography variant="body2">
                  {slo.current ? `${formatDuration(slo.current.errorBudget.remainingMinutes * 60000)} / ${formatDuration(slo.current.errorBudget.totalBudgetMinutes * 60000)}` : "-"}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Exhausts In
                </Typography>
                <Typography variant="body2">
                  {slo.current?.errorBudget.estimatedHoursToExhaustion !== null && slo.current?.errorBudget.estimatedHoursToExhaustion !== undefined
                    ? formatDuration(slo.current.errorBudget.estimatedHoursToExhaustion * 3600000)
                    : "Not depleting"}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Service
                </Typography>
                <Typography variant="body2">{projectName ?? "Organization-wide"}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Window
                </Typography>
                <Typography variant="body2">{slo.windowDays} days</Typography>
              </Grid>
              {slo.latencyThresholdMs !== null ? (
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="overline" color="text.secondary">
                    Latency Threshold
                  </Typography>
                  <Typography variant="body2">{slo.latencyThresholdMs}ms</Typography>
                </Grid>
              ) : null}
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Last Evaluated
                </Typography>
                <Typography variant="body2">{slo.current ? formatDateTime(slo.current.evaluatedAt) : "-"}</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 2 }}>
              <Typography variant="h4">SLI History</Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={window}
                onChange={(_event, value: SloHistoryWindow | null) => {
                  if (value) setWindow(value);
                }}
              >
                <ToggleButton value="1h">1h</ToggleButton>
                <ToggleButton value="24h">24h</ToggleButton>
                <ToggleButton value="7d">7d</ToggleButton>
                <ToggleButton value="30d">30d</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            {historyQuery.isLoading ? (
              <LoadingState label="Loading history..." minHeight={260} />
            ) : historyQuery.isError ? (
              <ErrorState message={getErrorMessage(historyQuery.error)} onRetry={() => historyQuery.refetch()} minHeight={260} />
            ) : (
              <SloHistoryChart evaluations={historyQuery.data ?? []} />
            )}
          </CardContent>
        </Card>

        {slo.projectId ? (
          <Card>
            <CardHeader title="Incident Contributions" slotProps={{ title: { variant: "h4" } }} />
            <CardContent sx={{ pt: 0 }}>
              {incidentAnalyticsQuery.isLoading ? (
                <LoadingState label="Loading incidents..." minHeight={120} />
              ) : incidentAnalyticsQuery.isError ? (
                <ErrorState message={getErrorMessage(incidentAnalyticsQuery.error)} onRetry={() => incidentAnalyticsQuery.refetch()} minHeight={120} />
              ) : !incidentAnalyticsQuery.data || incidentAnalyticsQuery.data.durationStats.count === 0 ? (
                <EmptyState message={`No incidents for this project in the last ${slo.windowDays} days.`} minHeight={120} />
              ) : (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      Incidents in Window
                    </Typography>
                    <Typography variant="body2">{incidentAnalyticsQuery.data.durationStats.count}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      HIGH/CRITICAL
                    </Typography>
                    <Typography variant="body2">
                      {incidentAnalyticsQuery.data.severityDistribution.HIGH + incidentAnalyticsQuery.data.severityDistribution.CRITICAL}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      MTTR
                    </Typography>
                    <Typography variant="body2">{formatDuration(incidentAnalyticsQuery.data.durationStats.mttrMs)}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      Top Cause
                    </Typography>
                    <Typography variant="body2">{incidentAnalyticsQuery.data.topCauses[0]?.label ?? "-"}</Typography>
                  </Grid>
                </Grid>
              )}
            </CardContent>
          </Card>
        ) : null}
      </Stack>

      <EditSloDialog slo={editOpen ? slo : null} onClose={() => setEditOpen(false)} />
    </PageContainer>
  );
}
