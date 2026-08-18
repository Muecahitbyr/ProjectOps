import { useMemo, useState } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TablePagination from "@mui/material/TablePagination";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { PageContainer } from "../components/layout/PageContainer";
import { AlertsTabs } from "../components/alerts/AlertsTabs";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useAlertEvents } from "../hooks/useAlertEvents";
import { useProjectsHealth } from "../hooks/useProjects";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime, formatDuration } from "../utils/formatters";
import { healthStatusColors } from "../theme/statusColors";
import type { AlertEventStatus, AlertRuleSeverity } from "../types/alert.types";

const SEVERITIES: AlertRuleSeverity[] = ["INFO", "WARNING", "HIGH", "CRITICAL"];
const STATUSES: AlertEventStatus[] = ["TRIGGERED", "RESOLVED", "SUPPRESSED"];
const PERIOD_OPTIONS = [
  { value: 24, label: "Last 24h" },
  { value: 24 * 7, label: "Last 7d" },
  { value: 24 * 30, label: "Last 30d" },
  { value: 0, label: "All time" },
];

const SEVERITY_COLORS: Record<AlertRuleSeverity, string> = {
  INFO: "#60a5fa",
  WARNING: healthStatusColors.warning,
  HIGH: "#f97316",
  CRITICAL: healthStatusColors.critical,
};

const STATUS_COLORS: Record<AlertEventStatus, string> = {
  TRIGGERED: healthStatusColors.critical,
  RESOLVED: healthStatusColors.healthy,
  SUPPRESSED: "#94a3b8",
};

function durationOf(startedAt: string, lastSeenAt: string, resolvedAt: string | null): string {
  const end = resolvedAt ?? lastSeenAt;
  return formatDuration(new Date(end).getTime() - new Date(startedAt).getTime());
}

// Auftragspunkt 3 "Alert History" (/alerts/history).
export function AlertHistory() {
  const [projectId, setProjectId] = useState("");
  const [severity, setSeverity] = useState<AlertRuleSeverity | "">("");
  const [status, setStatus] = useState<AlertEventStatus | "">("");
  const [periodHours, setPeriodHours] = useState(24 * 7);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const projectsQuery = useProjectsHealth();

  const from = useMemo(
    () => (periodHours > 0 ? new Date(Date.now() - periodHours * 60 * 60 * 1000).toISOString() : undefined),
    [periodHours],
  );

  const query = useAlertEvents({
    ...(projectId ? { projectId } : {}),
    ...(severity ? { severity } : {}),
    ...(status ? { status } : {}),
    ...(from ? { from } : {}),
    limit: pageSize,
    offset: page * pageSize,
  });

  return (
    <PageContainer title="Alert History">
      <AlertsTabs />
      <Stack direction="row" sx={{ gap: 1.5, flexWrap: "wrap", mb: 3 }}>
        <TextField select label="Project" size="small" value={projectId} onChange={(event) => { setProjectId(event.target.value); setPage(0); }} sx={{ minWidth: 180 }}>
          <MenuItem value="">All projects</MenuItem>
          {(projectsQuery.data ?? []).map((project) => (
            <MenuItem key={project.id} value={project.id}>
              {project.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Severity"
          size="small"
          value={severity}
          onChange={(event) => { setSeverity(event.target.value as AlertRuleSeverity | ""); setPage(0); }}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">All severities</MenuItem>
          {SEVERITIES.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Status"
          size="small"
          value={status}
          onChange={(event) => { setStatus(event.target.value as AlertEventStatus | ""); setPage(0); }}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {STATUSES.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Period"
          size="small"
          value={periodHours}
          onChange={(event) => { setPeriodHours(Number(event.target.value)); setPage(0); }}
          sx={{ minWidth: 150 }}
        >
          {PERIOD_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {query.isLoading ? (
        <LoadingState label="Loading alert history..." minHeight={300} />
      ) : query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={300} />
      ) : !query.data || query.data.items.length === 0 ? (
        <EmptyState message="No alerts triggered for this selection." minHeight={300} />
      ) : (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Started</TableCell>
                  <TableCell>Rule</TableCell>
                  <TableCell>Project</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell align="right">Duration</TableCell>
                  <TableCell align="right">Occurrences</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <Typography variant="body2">{formatDateTime(event.startedAt)}</Typography>
                    </TableCell>
                    <TableCell>{event.alertRuleName}</TableCell>
                    <TableCell>{event.projectName}</TableCell>
                    <TableCell>
                      <Chip size="small" label={event.severity} sx={{ backgroundColor: `${SEVERITY_COLORS[event.severity]}1f`, color: SEVERITY_COLORS[event.severity] }} />
                    </TableCell>
                    <TableCell align="right">{durationOf(event.startedAt, event.lastSeenAt, event.resolvedAt)}</TableCell>
                    <TableCell align="right">{event.occurrences}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={event.status === "SUPPRESSED" ? `SUPPRESSED (${event.suppressedReason ?? ""})` : event.status}
                        sx={{ backgroundColor: `${STATUS_COLORS[event.status]}1f`, color: STATUS_COLORS[event.status] }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={query.data.total}
            page={page}
            onPageChange={(_event, newPage) => setPage(newPage)}
            rowsPerPage={pageSize}
            onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </Card>
      )}
    </PageContainer>
  );
}
