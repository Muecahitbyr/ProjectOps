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
import { useAutomationActions } from "../../hooks/useAutomationActions";
import { useProjectsHealth } from "../../hooks/useProjects";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import type { AutomationActionStatus } from "../../types/automation.types";

const STATUS_COLORS: Record<AutomationActionStatus, string> = {
  PROPOSED: healthStatusColors.warning,
  APPROVED: healthStatusColors.healthy,
  REJECTED: "#94a3b8",
};

// Teil 3 "Automation Dashboard" (History-Tab) - der volle Entscheidungs-
// Verlauf jedes Automatisierungsvorschlags (wodurch ausgeloest, welche Regel,
// wie entschieden), unabhaengig davon, ob er am Ende tatsaechlich ausgefuehrt
// wurde. Fuer die eigentlichen Ausfuehrungsversuche siehe den Executions-Tab.
export function AutomationHistoryTab() {
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState<AutomationActionStatus | "">("");
  const projectsQuery = useProjectsHealth();
  const query = useAutomationActions(projectId || undefined, status || undefined);

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
        <TextField select label="Status" size="small" value={status} onChange={(event) => setStatus(event.target.value as AutomationActionStatus | "")} sx={{ minWidth: 160 }}>
          <MenuItem value="">All statuses</MenuItem>
          <MenuItem value="PROPOSED">Waiting approval</MenuItem>
          <MenuItem value="APPROVED">Approved</MenuItem>
          <MenuItem value="REJECTED">Rejected</MenuItem>
        </TextField>
      </Stack>

      {query.isLoading ? (
        <LoadingState label="Loading history..." minHeight={200} />
      ) : query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={200} />
      ) : !query.data || query.data.length === 0 ? (
        <EmptyState message="No automation history yet." minHeight={200} />
      ) : (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Status</TableCell>
                  <TableCell>Project</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Trigger</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.map((action) => (
                  <TableRow key={action.id} hover>
                    <TableCell>
                      <Chip
                        size="small"
                        label={action.status === "PROPOSED" ? "Waiting approval" : action.status}
                        sx={{ backgroundColor: `${STATUS_COLORS[action.status]}1f`, color: STATUS_COLORS[action.status] }}
                      />
                    </TableCell>
                    <TableCell>{action.projectId}</TableCell>
                    <TableCell>{action.action}</TableCell>
                    <TableCell sx={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{action.trigger}</TableCell>
                    <TableCell>{formatDateTime(action.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </Stack>
  );
}
