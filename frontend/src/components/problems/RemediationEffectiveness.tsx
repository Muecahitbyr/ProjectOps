import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useProblemEffectiveness } from "../../hooks/useProblems";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime, formatDuration } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import type { ChangeEffectiveness, EffectivenessStatus } from "../../types/remediation-effectiveness.types";

const STATUS_COLORS: Record<EffectivenessStatus, string> = {
  NOT_EVALUATED: healthStatusColors.warning,
  INSUFFICIENT_DATA: healthStatusColors.warning,
  NO_CHANGE: healthStatusColors.warning,
  IMPROVED: healthStatusColors.healthy,
  STRONGLY_IMPROVED: healthStatusColors.healthy,
  REGRESSED: healthStatusColors.critical,
  INCONCLUSIVE: healthStatusColors.warning,
};

const STATUS_LABELS: Record<EffectivenessStatus, string> = {
  NOT_EVALUATED: "Not Evaluated",
  INSUFFICIENT_DATA: "Insufficient Data",
  NO_CHANGE: "No Change",
  IMPROVED: "Improved",
  STRONGLY_IMPROVED: "Strongly Improved",
  REGRESSED: "Regressed",
  INCONCLUSIVE: "Inconclusive",
};

const WINDOW_OPTIONS = [7, 14, 30] as const;

// Phase 36 "Enterprise Remediation & Change Effectiveness Intelligence"
// Auftragspunkt 25 "Frontend" - eigene, fokussierte Komponente statt
// ProblemDetail.tsx weiter aufzublaehen. Rein lesend (kein CRUD hier).
export function RemediationEffectiveness({ problemId }: { problemId: string }) {
  const [windowDays, setWindowDays] = useState<7 | 14 | 30>(14);
  const query = useProblemEffectiveness(problemId, windowDays);

  return (
    <Card>
      <CardHeader
        title="Remediation Effectiveness"
        slotProps={{ title: { variant: "h6" } }}
        action={
          <ToggleButtonGroup size="small" exclusive value={windowDays} onChange={(_e, value: 7 | 14 | 30 | null) => value && setWindowDays(value)}>
            {WINDOW_OPTIONS.map((d) => (
              <ToggleButton key={d} value={d}>
                {d}d
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        {query.isLoading ? (
          <LoadingState label="Analyzing remediation effectiveness..." minHeight={160} />
        ) : query.isError ? (
          <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={160} />
        ) : !query.data || query.data.changes.length === 0 ? (
          <EmptyState message="No remediation changes linked to this problem yet." minHeight={120} />
        ) : (
          <Stack sx={{ gap: 3 }}>
            {query.data.changes.map((change) => (
              <ChangeEffectivenessCard key={change.changeId} change={change} />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function ChangeEffectivenessCard({ change }: { change: ChangeEffectiveness }) {
  const navigate = useNavigate();

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 1 }}>
          <Typography
            variant="subtitle1"
            sx={{ cursor: "pointer", textDecoration: "underline" }}
            onClick={() => navigate(`/changes/${change.changeId}`)}
          >
            {change.changeTitle} (#{change.changeId})
          </Typography>
          <Chip size="small" label={STATUS_LABELS[change.status]} sx={{ backgroundColor: `${STATUS_COLORS[change.status]}1f`, color: STATUS_COLORS[change.status] }} />
        </Stack>

        {change.executionTimestamp ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Executed: {formatDateTime(change.executionTimestamp)}
            {change.beforeWindow && change.afterWindow
              ? ` — comparing ${change.windowDays}d before (${formatDateTime(change.beforeWindow.from)} – ${formatDateTime(change.beforeWindow.to)}) vs. ${change.windowDays}d after (${formatDateTime(
                  change.afterWindow.from,
                )} – ${formatDateTime(change.afterWindow.to)})`
              : ""}
          </Typography>
        ) : null}

        {change.reasons.length > 0 ? (
          <Stack sx={{ gap: 0.5, mb: 2 }}>
            {change.reasons.map((reason, i) => (
              <Alert key={i} severity={change.status === "REGRESSED" ? "warning" : "info"} variant="outlined">
                {reason}
              </Alert>
            ))}
          </Stack>
        ) : null}

        {change.incidentComparison ? (
          <TableContainer sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Metric</TableCell>
                  <TableCell align="right">Before</TableCell>
                  <TableCell align="right">After</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Incidents</TableCell>
                  <TableCell align="right">{change.incidentComparison.before.count}</TableCell>
                  <TableCell align="right">{change.incidentComparison.after.count}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Incident Rate / day</TableCell>
                  <TableCell align="right">{change.incidentComparison.before.incidentRatePerDay}</TableCell>
                  <TableCell align="right">{change.incidentComparison.after.incidentRatePerDay}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Critical Incidents</TableCell>
                  <TableCell align="right">{change.incidentComparison.before.criticalCount}</TableCell>
                  <TableCell align="right">{change.incidentComparison.after.criticalCount}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>MTTR</TableCell>
                  <TableCell align="right">{formatDuration(change.incidentComparison.before.avgMttrMs)}</TableCell>
                  <TableCell align="right">{formatDuration(change.incidentComparison.after.avgMttrMs)}</TableCell>
                </TableRow>
                {change.sloComparison.map((slo) => (
                  <TableRow key={slo.sloId}>
                    <TableCell>SLO: {slo.sloName}</TableCell>
                    <TableCell align="right">
                      {slo.before.latestSliValue !== null ? `${slo.before.latestSliValue}% (${slo.before.latestStatus})` : "-"}
                    </TableCell>
                    <TableCell align="right">
                      {slo.after.latestSliValue !== null ? `${slo.after.latestSliValue}% (${slo.after.latestStatus})` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}

        {change.evidence.length > 0 ? (
          <Stack sx={{ gap: 0.5, mb: 2 }}>
            <Typography variant="overline" color="text.secondary">
              Evidence
            </Typography>
            {change.evidence.map((item, i) => (
              <Stack key={i} direction="row" sx={{ alignItems: "center", gap: 1 }}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={item.direction}
                  sx={{
                    color: item.direction === "IMPROVED" ? healthStatusColors.healthy : item.direction === "REGRESSED" ? healthStatusColors.critical : "text.secondary",
                    borderColor: item.direction === "IMPROVED" ? healthStatusColors.healthy : item.direction === "REGRESSED" ? healthStatusColors.critical : undefined,
                  }}
                />
                <Typography variant="body2">{item.interpretation}</Typography>
              </Stack>
            ))}
          </Stack>
        ) : null}

        {change.risk ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            Current change risk: score {change.risk.score}, verdict {change.risk.verdict}
            {change.risk.blockerCount > 0 ? `, ${change.risk.blockerCount} blocker(s)` : ""}
          </Typography>
        ) : null}

        {change.recommendation ? (
          <Alert severity="success" variant="outlined">
            {change.recommendation}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
