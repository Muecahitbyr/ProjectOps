import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Button from "@mui/material/Button";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { StatsCard } from "../components/dashboard/StatsCard";
import Typography from "@mui/material/Typography";
import { useOrganizations } from "../hooks/useOrganizations";
import { useResilienceOverview, usePriorityQueue, useAcknowledgePriorityItem, useOutcomeIntelligenceSummary, useCapacityWatchlist, useBusinessImpactOverview, useForecastAccuracySummary } from "../hooks/useResilience";
import type { BusinessImpactTier } from "../types/business-impact.types";
import { formatDateTime } from "../utils/formatters";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDuration } from "../utils/formatters";
import { healthStatusColors } from "../theme/statusColors";
import type { ResilienceOverviewRow, ResilienceRange, ResilienceStatus, PriorityQueueConfidence } from "../types/resilience.types";

const RANGE_OPTIONS: { value: ResilienceRange; label: string }[] = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
  { value: "90d", label: "Last 90d" },
];

// Phase 37 "Enterprise Service Resilience & Dependency Intelligence" -
// dieselbe Farbskala wie healthStatusColors, um AT_RISK/UNKNOWN erweitert
// (kein neues Farbschema, nur zwei zusaetzliche, klar unterscheidbare Toene).
const RESILIENCE_STATUS_COLORS: Record<ResilienceStatus, string> = {
  HEALTHY: healthStatusColors.healthy,
  DEGRADED: healthStatusColors.warning,
  AT_RISK: "#f97316",
  CRITICAL: healthStatusColors.critical,
  UNKNOWN: "#9ca3af",
};

function StatusChip({ status }: { status: ResilienceStatus }) {
  return <Chip size="small" label={status.replace("_", " ")} sx={{ backgroundColor: `${RESILIENCE_STATUS_COLORS[status]}1f`, color: RESILIENCE_STATUS_COLORS[status], fontWeight: 600 }} />;
}

// Phase 43 "Enterprise Operational Priority Intelligence".
const CONFIDENCE_LABEL: Record<PriorityQueueConfidence, string> = { HIGH: "High confidence", MEDIUM: "Medium confidence (forecast-based)" };

// Phase 47 "Enterprise Business Impact & Service Criticality Intelligence".
const IMPACT_TIER_COLOR: Record<BusinessImpactTier, string> = {
  SEVERE: healthStatusColors.critical,
  HIGH: healthStatusColors.critical,
  MODERATE: healthStatusColors.warning,
  LOW: "#9ca3af",
  NONE: healthStatusColors.healthy,
  UNKNOWN: "#9ca3af",
};

// Phase 37 Auftragspunkt "Frontend" - eigene, fokussierte Seite unter
// /resilience (NICHT die bestehende Reliability-Seite ueberladen, siehe
// Auftrag). Reine Uebersicht mit Verlinkung zur Detailseite je Projekt/Service.
export function Resilience() {
  const navigate = useNavigate();
  const [organizationId, setOrganizationId] = useState("");
  const [range, setRange] = useState<ResilienceRange>("7d");
  const [projectId, setProjectId] = useState("");

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

  const baseParams = useMemo(() => ({ organizationId, range }), [organizationId, range]);
  const filterParams = useMemo(() => ({ ...baseParams, ...(projectId ? { projectId } : {}) }), [baseParams, projectId]);

  const enabled = Boolean(organizationId);
  // Bewusst ohne Projekt-Filter fuer die Dropdown-Optionen (dieselbe
  // Ueberlegung wie Reliability.tsx: die Filterliste muss immer ALLE
  // Projekte enthalten), separat von der gefilterten Tabellen-Abfrage.
  const projectOptionsQuery = useResilienceOverview(baseParams, enabled);
  const overviewQuery = useResilienceOverview(filterParams, enabled);
  // Phase 43 "Enterprise Operational Priority Intelligence" - bewusst
  // org-weit (baseParams, kein Projekt-Filter): die Warteschlange soll IMMER
  // ueber alle Projekte hinweg priorisieren, unabhaengig vom Tabellenfilter.
  const priorityQueueQuery = usePriorityQueue(baseParams, enabled);
  // Phase 44 "Enterprise Priority Queue Acknowledgment Governance".
  const acknowledgeMutation = useAcknowledgePriorityItem();
  // Phase 45 "Enterprise Acknowledgment Outcome & Continuous Improvement
  // Intelligence" - ebenfalls org-weit (baseParams), unabhaengig vom
  // Tabellenfilter, dieselbe Ueberlegung wie priorityQueueQuery oben.
  const outcomeSummaryQuery = useOutcomeIntelligenceSummary(baseParams, enabled);
  // Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence" -
  // ebenfalls org-weit (baseParams), unabhaengig vom Tabellenfilter.
  const capacityWatchlistQuery = useCapacityWatchlist(baseParams, enabled);
  // Phase 47 "Enterprise Business Impact & Service Criticality Intelligence" -
  // ebenfalls org-weit (baseParams), unabhaengig vom Tabellenfilter.
  const businessImpactQuery = useBusinessImpactOverview(baseParams, enabled);
  // Phase 49 "Enterprise Risk Forecasting & Proactive Operations
  // Intelligence" - ebenfalls org-weit (baseParams), unabhaengig vom
  // Tabellenfilter.
  const forecastAccuracyQuery = useForecastAccuracySummary(baseParams, enabled);

  const summary = overviewQuery.data?.summary;

  return (
    <PageContainer title="Resilience">
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
            <TextField select size="small" label="Time range" value={range} onChange={(event) => setRange(event.target.value as ResilienceRange)} sx={{ minWidth: 150 }}>
              {RANGE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="">All projects</MenuItem>
              {(projectOptionsQuery.data?.rows ?? []).map((row) => (
                <MenuItem key={row.projectId} value={row.projectId}>
                  {row.projectName}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      {!organizationId ? (
        <EmptyState message="Select an organization to view its resilience data." minHeight={240} />
      ) : (
        <Stack sx={{ gap: 3 }}>
          {overviewQuery.isLoading ? (
            <LoadingState label="Loading resilience overview..." minHeight={160} />
          ) : overviewQuery.isError ? (
            <ErrorState message={getErrorMessage(overviewQuery.error)} onRetry={() => overviewQuery.refetch()} minHeight={160} />
          ) : summary ? (
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <StatsCard label="Critical" value={summary.critical} accentColor={healthStatusColors.critical} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <StatsCard label="At Risk" value={summary.atRisk} accentColor={RESILIENCE_STATUS_COLORS.AT_RISK} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <StatsCard label="Degraded" value={summary.degraded} accentColor={healthStatusColors.warning} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <StatsCard label="Healthy" value={summary.healthy} accentColor={healthStatusColors.healthy} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <StatsCard label="Unknown" value={summary.unknown} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <StatsCard label="Potential SPOFs" value={summary.potentialSpofCount} accentColor={healthStatusColors.critical} />
              </Grid>
            </Grid>
          ) : null}

          {outcomeSummaryQuery.data && outcomeSummaryQuery.data.evaluatedAcknowledgments > 0 ? (
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Outcome Intelligence
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Did past acknowledgments actually lead to a durable improvement? Derived from resilience status transitions following each acknowledgment, over a {outcomeSummaryQuery.data.evaluatedAcknowledgments === 1 ? "1-acknowledgment" : `${outcomeSummaryQuery.data.evaluatedAcknowledgments}-acknowledgment`} sample.
                </Typography>
                <Grid container spacing={2} sx={{ mb: outcomeSummaryQuery.data.recurringProjects.length > 0 ? 2 : 0 }}>
                  <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <StatsCard label="Resolution rate" value={outcomeSummaryQuery.data.resolutionRatePercent !== null ? `${outcomeSummaryQuery.data.resolutionRatePercent}%` : "-"} accentColor={healthStatusColors.healthy} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <StatsCard label="Resolved" value={outcomeSummaryQuery.data.counts.RESOLVED} accentColor={healthStatusColors.healthy} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <StatsCard label="Partially resolved" value={outcomeSummaryQuery.data.counts.PARTIALLY_RESOLVED} accentColor={healthStatusColors.warning} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <StatsCard label="Regressed" value={outcomeSummaryQuery.data.counts.REGRESSED} accentColor={healthStatusColors.critical} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <StatsCard label="Unresolved" value={outcomeSummaryQuery.data.counts.UNRESOLVED} accentColor={healthStatusColors.critical} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <StatsCard label="Avg time to recovery" value={formatDuration(outcomeSummaryQuery.data.avgTimeToRecoveryMs)} />
                  </Grid>
                </Grid>
                {outcomeSummaryQuery.data.recurringProjects.length > 0 ? (
                  <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                    <Typography variant="body2" sx={{ mr: 1, alignSelf: "center" }}>
                      Recurring pattern:
                    </Typography>
                    {outcomeSummaryQuery.data.recurringProjects.map((p) => (
                      <Tooltip key={p.projectId} title={`${p.regressedCount} regressed / ${p.unresolvedCount} unresolved out of ${p.totalAcknowledgments} acknowledgments in this window - repeated remediation has not held.`}>
                        <Chip size="small" color="error" variant="outlined" label={p.projectName} onClick={() => navigate(`/resilience/${p.projectId}`)} />
                      </Tooltip>
                    ))}
                  </Stack>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {businessImpactQuery.data && businessImpactQuery.data.entries.some((e) => e.businessImpact.tier !== "NONE" && e.businessImpact.tier !== "UNKNOWN") ? (
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Business Impact
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  The same technical issues, re-ranked by which business-critical services (own or dependent) are actually affected right now - not just by raw technical severity.
                </Typography>
                <Stack sx={{ gap: 1 }}>
                  {businessImpactQuery.data.entries
                    .filter((e) => e.businessImpact.tier !== "NONE" && e.businessImpact.tier !== "UNKNOWN")
                    .map((entry) => (
                      <Stack
                        key={entry.projectId}
                        direction="row"
                        sx={{ alignItems: "center", gap: 2, p: 1.5, borderRadius: 1, border: "1px solid", borderColor: "divider", cursor: "pointer" }}
                        onClick={() => navigate(`/resilience/${entry.projectId}`)}
                      >
                        <Chip
                          size="small"
                          label={entry.businessImpact.tier}
                          sx={{ backgroundColor: `${IMPACT_TIER_COLOR[entry.businessImpact.tier]}1f`, color: IMPACT_TIER_COLOR[entry.businessImpact.tier], fontWeight: 600 }}
                        />
                        <Stack sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2">{entry.serviceName ?? entry.projectName}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Own criticality: {entry.businessImpact.ownCriticality ?? "-"} · {entry.businessImpact.activelyImpactedDependentCount} dependent service(s) actively impacted
                          </Typography>
                        </Stack>
                      </Stack>
                    ))}
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Priority Queue
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Non-healthy projects ranked by a deterministic priority score, with the most severe contributing signal and a recommended next action.
              </Typography>
              {priorityQueueQuery.isLoading ? (
                <LoadingState label="Loading priority queue..." minHeight={120} />
              ) : priorityQueueQuery.isError ? (
                <ErrorState message={getErrorMessage(priorityQueueQuery.error)} onRetry={() => priorityQueueQuery.refetch()} minHeight={120} />
              ) : (priorityQueueQuery.data?.entries ?? []).length === 0 ? (
                <EmptyState message="No projects currently need attention - everything is healthy." minHeight={100} />
              ) : (
                <Stack sx={{ gap: 1 }}>
                  {priorityQueueQuery.data!.entries.map((entry, i) => (
                    <Stack
                      key={entry.projectId}
                      direction="row"
                      sx={{ alignItems: "center", gap: 2, p: 1.5, borderRadius: 1, border: "1px solid", borderColor: "divider", cursor: "pointer" }}
                      onClick={() => navigate(`/resilience/${entry.projectId}`)}
                    >
                      <Typography variant="h6" color="text.secondary" sx={{ width: 28, textAlign: "center" }}>
                        {i + 1}
                      </Typography>
                      <StatusChip status={entry.resilienceStatus} />
                      <Stack sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2">{entry.serviceName ?? entry.projectName}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {entry.primaryReason ? `${entry.primaryReason.title}: ${entry.primaryReason.explanation}` : "No specific signal - see resilience detail."}
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          Recommended: {entry.recommendedAction}
                        </Typography>
                      </Stack>
                      <Tooltip title={CONFIDENCE_LABEL[entry.confidence]}>
                        <Chip size="small" variant="outlined" label={entry.confidence} />
                      </Tooltip>
                      {entry.acknowledgment ? (
                        <Tooltip title={`Acknowledged ${formatDateTime(entry.acknowledgment.acknowledgedAt)}${entry.acknowledgment.note ? ` — "${entry.acknowledgment.note}"` : ""}`}>
                          <Chip size="small" icon={<CheckCircleOutlineIcon fontSize="small" />} label="Acknowledged" color="success" variant="outlined" />
                        </Tooltip>
                      ) : (
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={acknowledgeMutation.isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            acknowledgeMutation.mutate({ projectId: entry.projectId, range });
                          }}
                        >
                          Acknowledge
                        </Button>
                      )}
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Capacity Watchlist
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Projects with a degrading forecast trend (availability, incident rate, or response time) - shown here even while still HEALTHY, so an early warning is visible before a project actually becomes unhealthy.
              </Typography>
              {capacityWatchlistQuery.isLoading ? (
                <LoadingState label="Loading capacity watchlist..." minHeight={100} />
              ) : capacityWatchlistQuery.isError ? (
                <ErrorState message={getErrorMessage(capacityWatchlistQuery.error)} onRetry={() => capacityWatchlistQuery.refetch()} minHeight={100} />
              ) : (capacityWatchlistQuery.data?.entries ?? []).length === 0 ? (
                <EmptyState message="No projects currently show a degrading capacity trend." minHeight={80} />
              ) : (
                <Stack sx={{ gap: 1 }}>
                  {capacityWatchlistQuery.data!.entries.map((entry) => (
                    <Stack
                      key={entry.projectId}
                      direction="row"
                      sx={{ alignItems: "center", gap: 2, p: 1.5, borderRadius: 1, border: "1px solid", borderColor: "divider", cursor: "pointer" }}
                      onClick={() => navigate(`/resilience/${entry.projectId}`)}
                    >
                      <StatusChip status={entry.resilienceStatus} />
                      <Stack sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2">{entry.serviceName ?? entry.projectName}</Typography>
                        {entry.capacitySignals.map((signal) => (
                          <Typography key={signal.type} variant="body2" color="text.secondary">
                            {signal.title}: {signal.explanation}
                          </Typography>
                        ))}
                      </Stack>
                      {entry.isPotentialSpof ? (
                        <Tooltip title="Potential Single Point of Failure - heuristic, not a confirmed lack of redundancy.">
                          <Chip size="small" label={`SPOF · blast radius ${entry.blastRadius}`} color="error" variant="outlined" />
                        </Tooltip>
                      ) : entry.dependentCount > 0 ? (
                        <Tooltip title={`${entry.dependentCount} service(s) depend on this one - a capacity issue here could affect them too.`}>
                          <Chip size="small" label={`${entry.dependentCount} dependent(s)`} variant="outlined" />
                        </Tooltip>
                      ) : null}
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          {forecastAccuracyQuery.data && forecastAccuracyQuery.data.totalDetections > 0 ? (
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Forecast Accuracy
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Did past proactive risk warnings (Capacity Watchlist alerts sent while the service was still healthy) actually come true within their 7-day forecast window?
                </Typography>
                <Grid container spacing={2} sx={{ mb: forecastAccuracyQuery.data.pendingCount > 0 ? 2 : 0 }}>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <StatsCard
                      label="Accuracy rate"
                      value={forecastAccuracyQuery.data.accuracyRatePercent !== null ? `${forecastAccuracyQuery.data.accuracyRatePercent}%` : "Insufficient data"}
                      accentColor={healthStatusColors.healthy}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <StatsCard label="Confirmed" value={forecastAccuracyQuery.data.confirmedCount} accentColor={healthStatusColors.healthy} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <StatsCard label="False positives" value={forecastAccuracyQuery.data.falsePositiveCount} accentColor={healthStatusColors.warning} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <StatsCard label="Pending" value={forecastAccuracyQuery.data.pendingCount} />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent>
              {overviewQuery.isLoading ? (
                <LoadingState label="Loading services..." minHeight={200} />
              ) : (overviewQuery.data?.rows ?? []).length === 0 ? (
                <EmptyState message="No projects in this organization." minHeight={200} />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Service / Project</TableCell>
                        <TableCell align="right">Health</TableCell>
                        <TableCell align="right">SLO</TableCell>
                        <TableCell align="right">Incidents</TableCell>
                        <TableCell align="right">MTTR</TableCell>
                        <TableCell align="right">Problems</TableCell>
                        <TableCell align="right">Dependencies</TableCell>
                        <TableCell align="right">Blast Radius</TableCell>
                        <TableCell align="right">Resilience</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(overviewQuery.data?.rows ?? []).map((row: ResilienceOverviewRow) => (
                        <TableRow key={row.projectId} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/resilience/${row.projectId}`)}>
                          <TableCell>
                            <Stack sx={{ gap: 0 }}>
                              {row.serviceName ?? row.projectName}
                              {row.serviceName ? (
                                <Stack direction="row" sx={{ color: "text.secondary", fontSize: 12 }}>
                                  {row.projectName}
                                </Stack>
                              ) : null}
                            </Stack>
                          </TableCell>
                          <TableCell align="right">{row.healthStatus === "UNKNOWN" ? "-" : row.healthScore}</TableCell>
                          <TableCell align="right">{row.sloCount > 0 ? `${row.sloCount} · ${row.worstSloStatus ?? "PENDING"}` : "-"}</TableCell>
                          <TableCell align="right">
                            {row.incidentCount}
                            {row.highCriticalCount > 0 ? ` (${row.highCriticalCount} high/crit)` : ""}
                          </TableCell>
                          <TableCell align="right">{formatDuration(row.mttrMs)}</TableCell>
                          <TableCell align="right">
                            {row.openProblems}
                            {row.openCriticalProblems > 0 ? ` (${row.openCriticalProblems} crit)` : ""}
                          </TableCell>
                          <TableCell align="right">
                            {row.dependencyCount} / {row.dependentCount}
                          </TableCell>
                          <TableCell align="right">
                            {row.isPotentialSpof ? (
                              <Tooltip title="Potential Single Point of Failure - heuristic, not a confirmed lack of redundancy.">
                                <Chip size="small" label={`SPOF · ${row.blastRadius}`} color="error" variant="outlined" />
                              </Tooltip>
                            ) : (
                              row.blastRadius
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <StatusChip status={row.resilienceStatus} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Stack>
      )}
    </PageContainer>
  );
}
