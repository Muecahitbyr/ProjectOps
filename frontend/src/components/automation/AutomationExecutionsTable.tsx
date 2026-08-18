import { useState } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useAutomationExecutions } from "../../hooks/useAutomationExecutions";
import { useProjectsHealth } from "../../hooks/useProjects";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime, formatDuration } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import { ExecutionDetailDialog } from "./ExecutionDetailDialog";
import type { AutomationExecution, AutomationExecutionStatus } from "../../types/automation.types";

interface AutomationExecutionsTableProps {
  statusFilterOptions: AutomationExecutionStatus[];
  emptyMessage: string;
  defaultStatus?: AutomationExecutionStatus | "";
}

const STATUS_COLORS: Record<AutomationExecutionStatus, string> = {
  CREATED: "#94a3b8",
  APPROVED: "#60a5fa",
  RUNNING: healthStatusColors.warning,
  SUCCESS: healthStatusColors.healthy,
  FAILED: healthStatusColors.critical,
  CANCELLED: "#94a3b8",
};

export function AutomationExecutionsTable({ statusFilterOptions, emptyMessage, defaultStatus = "" }: AutomationExecutionsTableProps) {
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState<AutomationExecutionStatus | "">(defaultStatus);
  const [selected, setSelected] = useState<AutomationExecution | null>(null);
  const projectsQuery = useProjectsHealth();

  const query = useAutomationExecutions({
    ...(projectId ? { projectId } : {}),
    ...(status ? { status } : {}),
    limit: 100,
  });

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack direction="row" sx={{ gap: 2, flexWrap: "wrap" }}>
        <TextField select label="Project" size="small" value={projectId} onChange={(event) => setProjectId(event.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">All projects</MenuItem>
          {(projectsQuery.data ?? []).map((project) => (
            <MenuItem key={project.id} value={project.id}>
              {project.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Status" size="small" value={status} onChange={(event) => setStatus(event.target.value as AutomationExecutionStatus | "")} sx={{ minWidth: 160 }}>
          <MenuItem value="">All statuses</MenuItem>
          {statusFilterOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {query.isLoading ? (
        <LoadingState label="Loading executions..." minHeight={200} />
      ) : query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={200} />
      ) : !query.data || query.data.length === 0 ? (
        <EmptyState message={emptyMessage} minHeight={200} />
      ) : (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Status</TableCell>
                  <TableCell>Started</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Executed by</TableCell>
                  <TableCell>Result</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.map((execution) => (
                  <TableRow key={execution.id} hover sx={{ cursor: "pointer" }} onClick={() => setSelected(execution)}>
                    <TableCell>
                      <Chip
                        size="small"
                        label={execution.status}
                        sx={{ backgroundColor: `${STATUS_COLORS[execution.status]}1f`, color: STATUS_COLORS[execution.status] }}
                      />
                      {execution.dryRun ? <Chip size="small" variant="outlined" label="Dry run" sx={{ ml: 0.5 }} /> : null}
                    </TableCell>
                    <TableCell>{formatDateTime(execution.startedAt)}</TableCell>
                    <TableCell>{formatDuration(execution.durationMs)}</TableCell>
                    <TableCell>{execution.executedBy ? execution.executedBy : "System (automatic)"}</TableCell>
                    <TableCell sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {execution.error ?? (execution.result ? JSON.stringify(execution.result) : "-")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <ExecutionDetailDialog execution={selected} onClose={() => setSelected(null)} />
    </Stack>
  );
}
