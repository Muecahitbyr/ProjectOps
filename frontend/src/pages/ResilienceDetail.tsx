import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { StatsCard } from "../components/dashboard/StatsCard";
import { useServiceResilienceDetail, useDecisionContext } from "../hooks/useResilience";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDuration } from "../utils/formatters";
import { healthStatusColors } from "../theme/statusColors";
import type { ResilienceRange, ResilienceStatus, ResilienceSignal, ResilienceForecastSummary, ResilienceForecastTrend } from "../types/resilience.types";
import type { BusinessImpactTier } from "../types/business-impact.types";
import type { RecommendationConfidence } from "../types/decision-context.types";

const RANGE_OPTIONS: { value: ResilienceRange; label: string }[] = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
  { value: "90d", label: "Last 90d" },
];

const RESILIENCE_STATUS_COLORS: Record<ResilienceStatus, string> = {
  HEALTHY: healthStatusColors.healthy,
  DEGRADED: healthStatusColors.warning,
  AT_RISK: "#f97316",
  CRITICAL: healthStatusColors.critical,
  UNKNOWN: "#9ca3af",
};

const SIGNAL_SEVERITY_COLOR: Record<ResilienceSignal["severity"], "info" | "warning" | "error"> = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "error",
};

// Phase 50 "Enterprise Operational Decision & Executive Intelligence".
const CONFIDENCE_ALERT_SEVERITY: Record<RecommendationConfidence, "info" | "warning" | "error"> = {
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "info",
};

// Phase 42 "Enterprise Resilience Forecast Intelligence".
const TREND_COLOR: Record<ResilienceForecastTrend, string> = {
  IMPROVING: healthStatusColors.healthy,
  STABLE: "text.secondary",
  DEGRADING: healthStatusColors.critical,
  UNKNOWN: "text.secondary",
};

// Phase 47 "Enterprise Business Impact & Service Criticality Intelligence".
const IMPACT_TIER_COLOR: Record<BusinessImpactTier, string> = {
  SEVERE: healthStatusColors.critical,
  HIGH: healthStatusColors.critical,
  MODERATE: healthStatusColors.warning,
  LOW: "text.secondary",
  NONE: healthStatusColors.healthy,
  UNKNOWN: "text.secondary",
};

// Phase 37 "Enterprise Service Resilience & Dependency Intelligence"
// Auftragspunkt "Frontend" - Detailseite je Projekt/Service, ausschliesslich
// ueber core/service-resilience.ts#buildServiceResilienceDetail() (EIN
// Request liefert Health/Reliability/SLO/Problems/Dependencies/Blast
// Radius/Change Risk/Remediation Effectiveness/Signals zusammen).
export function ResilienceDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [range, setRange] = useState<ResilienceRange>("7d");

  const detailQuery = useServiceResilienceDetail(projectId ?? "", range, Boolean(projectId));
  // Phase 50 "Enterprise Operational Decision & Executive Intelligence".
  const decisionContextQuery = useDecisionContext(projectId ?? "", range, Boolean(projectId));

  if (!projectId) {
    return (
      <PageContainer title="Resilience">
        <ErrorState message="No project id provided." />
      </PageContainer>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <PageContainer title="Resilience">
        <LoadingState label="Loading resilience detail..." minHeight={320} />
      </PageContainer>
    );
  }

  if (detailQuery.isError) {
    return (
      <PageContainer title="Resilience">
        <ErrorState message={getErrorMessage(detailQuery.error)} onRetry={() => detailQuery.refetch()} minHeight={320} />
      </PageContainer>
    );
  }

  const detail = detailQuery.data;
  if (!detail) {
    return (
      <PageContainer title="Resilience">
        <EmptyState message="Project not found." minHeight={320} />
      </PageContainer>
    );
  }

  return (
    <PageContainer title={detail.serviceName ?? detail.projectName}>
      <Stack sx={{ gap: 3 }}>
        <Card>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
              <Stack sx={{ gap: 0.5 }}>
                <Typography variant="h6">{detail.serviceName ?? detail.projectName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {detail.projectName}
                  {detail.serviceCriticality ? ` · Criticality: ${detail.serviceCriticality}` : ""}
                </Typography>
              </Stack>
              <Stack direction="row" sx={{ gap: 2, alignItems: "center" }}>
                <TextField select size="small" label="Time range" value={range} onChange={(event) => setRange(event.target.value as ResilienceRange)} sx={{ minWidth: 150 }}>
                  {RANGE_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
                <Chip
                  label={detail.resilienceStatus.replace("_", " ")}
                  sx={{ backgroundColor: `${RESILIENCE_STATUS_COLORS[detail.resilienceStatus]}1f`, color: RESILIENCE_STATUS_COLORS[detail.resilienceStatus], fontWeight: 600 }}
                />
                {detail.isPotentialSpof ? <Chip label="Potential SPOF" color="error" variant="outlined" /> : null}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Section title="Recommendations">
          {decisionContextQuery.isLoading ? (
            <LoadingState label="Loading recommendations..." minHeight={80} />
          ) : decisionContextQuery.isError ? (
            <ErrorState message={getErrorMessage(decisionContextQuery.error)} onRetry={() => decisionContextQuery.refetch()} minHeight={80} />
          ) : !decisionContextQuery.data || decisionContextQuery.data.recommendations.length === 0 ? (
            <EmptyState message="No recommendations right now - nothing here currently needs attention." minHeight={80} />
          ) : (
            <Stack sx={{ gap: 1.5 }}>
              {decisionContextQuery.data.recommendations.map((rec, i) => (
                <Alert key={`${rec.kind}-${i}`} severity={CONFIDENCE_ALERT_SEVERITY[rec.confidence]} variant="outlined">
                  <Stack sx={{ gap: 0.5 }}>
                    <Typography variant="subtitle2">{rec.problem}</Typography>
                    <Typography variant="body2">
                      <strong>Recommended:</strong> {rec.recommendedAction}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {rec.reasoning}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Expected effect: {rec.expectedEffect}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Risks: {rec.risks}
                    </Typography>
                    <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mt: 0.5 }}>
                      <Chip size="small" variant="outlined" label={`${rec.confidence} confidence`} />
                      <Chip size="small" variant="outlined" label={`Requires: ${rec.requiredPermission}`} />
                      {rec.requiresApproval ? <Chip size="small" variant="outlined" color="warning" label="Approval required" /> : null}
                      {rec.alternative ? <Chip size="small" variant="outlined" label={`Alternative: ${rec.alternative}`} /> : null}
                    </Stack>
                  </Stack>
                </Alert>
              ))}
            </Stack>
          )}
        </Section>

        <Section title="Resilience Signals">
          {detail.signals.length === 0 ? (
            <EmptyState message="No resilience signals for this service in the selected window." minHeight={80} />
          ) : (
            <Stack sx={{ gap: 1 }}>
              {detail.signals.map((signal, i) => (
                <Alert key={`${signal.type}-${i}`} severity={SIGNAL_SEVERITY_COLOR[signal.severity]} variant="outlined">
                  <strong>{signal.title}</strong> ({signal.affectedEntity.name}) — {signal.explanation}
                </Alert>
              ))}
            </Stack>
          )}
        </Section>

        <Section title="Health & Reliability">
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <StatsCard label="Open Incidents" value={detail.health.openIncidents} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <StatsCard label="Incidents in Window" value={detail.reliability.incidentCount} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <StatsCard label="High/Critical" value={detail.reliability.highCriticalCount} accentColor={healthStatusColors.critical} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <StatsCard label="MTTR" value={formatDuration(detail.reliability.mttrMs)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <StatsCard label="Recurring Incidents" value={detail.reliability.recurringIncidentCount} />
            </Grid>
          </Grid>
          {detail.health.reasons.length > 0 ? (
            <Stack sx={{ gap: 1, mt: 2 }}>
              {detail.health.reasons.map((reason, i) => (
                <Alert key={i} severity="warning" variant="outlined">
                  {reason}
                </Alert>
              ))}
            </Stack>
          ) : null}
        </Section>

        <Section title="Forecast (7-day trend)">
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <ForecastCard label="Availability" unit="%" forecast={detail.forecast.healthScore} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <ForecastCard label="Incidents / day" unit="" forecast={detail.forecast.incidentCount} />
            </Grid>
            {/* Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence". */}
            <Grid size={{ xs: 12, sm: 4 }}>
              <ForecastCard label="Response time" unit="ms" forecast={detail.forecast.responseTimeMs} />
            </Grid>
          </Grid>
        </Section>

        <Section title="SLO & Error Budget">
          {detail.slo.sloCount === 0 ? (
            <EmptyState message="No SLOs configured for this project." minHeight={80} />
          ) : (
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 4 }}>
                <StatsCard label="SLOs" value={detail.slo.sloCount} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <StatsCard label="Worst Status" value={detail.slo.worstSloStatus ?? "PENDING"} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <StatsCard label="Avg Error Budget Remaining" value={detail.slo.avgErrorBudgetRemainingPercent !== null ? `${detail.slo.avgErrorBudgetRemainingPercent}%` : "-"} />
              </Grid>
            </Grid>
          )}
        </Section>

        <Section title="Problems">
          {detail.problems.items.length === 0 ? (
            <EmptyState message="No open problems for this project." minHeight={80} />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Title</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Priority</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.problems.items.map((problem) => (
                    <TableRow key={problem.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/problems/${problem.id}`)}>
                      <TableCell>{problem.title}</TableCell>
                      <TableCell>{problem.status}</TableCell>
                      <TableCell>{problem.priority}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Section>

        <Section title="Blast Radius">
          {!detail.blastRadius ? (
            <EmptyState message="No service catalog entry linked to this project - blast radius cannot be computed." minHeight={80} />
          ) : (
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatsCard label="Affected Services" value={detail.blastRadius.affectedServiceCount} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatsCard label="Max Depth" value={detail.blastRadius.maxDepthReached} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatsCard label="Critical Paths" value={detail.blastRadius.hasCriticalPath ? "Yes" : "No"} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatsCard label="SPOF Candidates" value={detail.blastRadius.spofCount} />
              </Grid>
            </Grid>
          )}
        </Section>

        <Section title="Business Impact">
          {detail.businessImpact.tier === "UNKNOWN" ? (
            <EmptyState message="No service catalog entry linked to this project - business impact cannot be assessed." minHeight={80} />
          ) : (
            <Stack sx={{ gap: 2 }}>
              <Stack direction="row" sx={{ alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                <Chip label={detail.businessImpact.tier} sx={{ color: IMPACT_TIER_COLOR[detail.businessImpact.tier], borderColor: IMPACT_TIER_COLOR[detail.businessImpact.tier], fontWeight: 600 }} variant="outlined" />
                <Typography variant="body2" color="text.secondary">
                  Own criticality: {detail.businessImpact.ownCriticality ?? "-"}
                  {detail.businessImpact.ownBusinessOwner ? ` · Business owner: ${detail.businessImpact.ownBusinessOwner}` : ""}
                </Typography>
                {detail.businessImpact.dataQuality === "TRUNCATED" ? (
                  <Chip size="small" label="Blast radius truncated - real impact may be larger" variant="outlined" />
                ) : null}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {detail.businessImpact.activelyImpactedDependentCount} of {detail.businessImpact.affectedDependentCount} dependent service(s) in the blast radius are currently actively impacted.
              </Typography>
              {detail.businessImpact.factors.length === 0 ? (
                <EmptyState message="Nothing currently impacted - business impact is NONE." minHeight={60} />
              ) : (
                <Stack sx={{ gap: 1 }}>
                  {detail.businessImpact.factors.map((factor, i) => (
                    <Stack key={i} direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                      <Chip size="small" variant="outlined" label={factor.serviceCriticality} />
                      <Typography variant="body2">
                        <strong>{factor.serviceName}</strong>
                        {factor.businessOwner ? ` (${factor.businessOwner})` : ""}: {factor.detail}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Stack>
          )}
        </Section>

        <Section title="Dependencies">
          {!detail.dependencies || (detail.dependencies.dependencies.length === 0 && detail.dependencies.dependents.length === 0) ? (
            <EmptyState message="No service dependencies configured." minHeight={80} />
          ) : (
            <Stack sx={{ gap: 3 }}>
              <DependencyTable title="Depends On" entries={detail.dependencies.dependencies} />
              <DependencyTable title="Depended On By" entries={detail.dependencies.dependents} />
            </Stack>
          )}
        </Section>

        {detail.activeChangeRisks.length > 0 ? (
          <Section title="Active Change Risk">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Change</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Score</TableCell>
                    <TableCell align="right">Verdict</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.activeChangeRisks.map((change) => (
                    <TableRow key={change.changeId} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/changes/${change.changeId}`)}>
                      <TableCell>{change.title}</TableCell>
                      <TableCell>{change.status}</TableCell>
                      <TableCell align="right">{change.score}</TableCell>
                      <TableCell align="right">{change.verdict}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Section>
        ) : null}

        {detail.remediationEffectiveness.length > 0 ? (
          <Section title="Remediation Effectiveness">
            <Stack sx={{ gap: 1 }}>
              {detail.remediationEffectiveness.map((r, i) => (
                <Alert key={i} severity={r.status === "REGRESSED" ? "warning" : "info"} variant="outlined">
                  {r.changeTitle}: {r.status}
                </Alert>
              ))}
            </Stack>
          </Section>
        ) : null}
      </Stack>
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

// Phase 42 "Enterprise Resilience Forecast Intelligence" - eigene, kleine
// Karte statt StatsCard (zeigt zusaetzlich Trendrichtung + R^2, StatsCard
// kennt nur einen einzelnen Wert).
function ForecastCard({ label, unit, forecast }: { label: string; unit: string; forecast: ResilienceForecastSummary }) {
  if (!forecast.sufficientData) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Not enough historical data yet for a forecast.
          </Typography>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
          <Chip size="small" label={forecast.trend} sx={{ color: TREND_COLOR[forecast.trend], borderColor: TREND_COLOR[forecast.trend] }} variant="outlined" />
        </Stack>
        <Stack direction="row" sx={{ gap: 3, mt: 1 }}>
          <Stack>
            <Typography variant="caption" color="text.secondary">
              Current
            </Typography>
            <Typography variant="h6">
              {forecast.currentValue ?? "-"}
              {unit}
            </Typography>
          </Stack>
          <Stack>
            <Typography variant="caption" color="text.secondary">
              In {forecast.forecastDays}d
            </Typography>
            <Typography variant="h6" sx={{ color: TREND_COLOR[forecast.trend] }}>
              {forecast.projectedValue ?? "-"}
              {unit}
            </Typography>
          </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Slope: {forecast.slopePerDay ?? "-"}/day · R² {forecast.rSquared ?? "-"}
        </Typography>
      </CardContent>
    </Card>
  );
}

function DependencyTable({ title, entries }: { title: string; entries: { serviceId: number; serviceName: string; dependencyType: string; criticality: string; healthStatus: ResilienceStatus | "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN"; openIncidents: number; worstSloStatus: string | null }[] }) {
  if (entries.length === 0) {
    return (
      <Stack sx={{ gap: 1 }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          None.
        </Typography>
      </Stack>
    );
  }
  return (
    <Stack sx={{ gap: 1 }}>
      <Typography variant="subtitle2">{title}</Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Service</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Criticality</TableCell>
              <TableCell>Health</TableCell>
              <TableCell align="right">Open Incidents</TableCell>
              <TableCell>SLO</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.serviceId} hover>
                <TableCell>{entry.serviceName}</TableCell>
                <TableCell>{entry.dependencyType}</TableCell>
                <TableCell>{entry.criticality}</TableCell>
                <TableCell>{entry.healthStatus}</TableCell>
                <TableCell align="right">{entry.openIncidents}</TableCell>
                <TableCell>{entry.worstSloStatus ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
