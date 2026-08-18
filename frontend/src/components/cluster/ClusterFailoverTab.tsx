import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useFailoverHistory } from "../../hooks/useCluster";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime, formatDuration } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";

// Phase 14 Teil 5 "Agent Failover" - "Ausgefallene Agents", "Uebernommene
// Checks", "Failover Historie", "Recovery Zeit" aus echten
// cluster_events-Paaren (FAILOVER_STARTED/FINISHED, siehe core/failover.ts).
export function ClusterFailoverTab() {
  const historyQuery = useFailoverHistory(50);

  if (historyQuery.isLoading) {
    return <LoadingState label="Loading failover history..." minHeight={200} />;
  }
  if (historyQuery.isError || !historyQuery.data) {
    return <ErrorState message={getErrorMessage(historyQuery.error)} onRetry={() => historyQuery.refetch()} minHeight={200} />;
  }
  if (historyQuery.data.length === 0) {
    return <EmptyState message="No failovers recorded yet - all agents have been healthy." minHeight={200} />;
  }

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Failed Agent</TableCell>
            <TableCell align="right">Checks Taken Over</TableCell>
            <TableCell>Started</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Recovery Time</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {historyQuery.data.map((entry) => (
            <TableRow key={entry.failoverId}>
              <TableCell>{entry.failedAgentName}</TableCell>
              <TableCell align="right">{entry.reassignedCheckCount}</TableCell>
              <TableCell>{formatDateTime(entry.startedAt)}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={entry.finishedAt ? "Resolved" : "In progress"}
                  sx={{
                    backgroundColor: `${entry.finishedAt ? healthStatusColors.healthy : healthStatusColors.warning}1f`,
                    color: entry.finishedAt ? healthStatusColors.healthy : healthStatusColors.warning,
                  }}
                />
              </TableCell>
              <TableCell align="right">{formatDuration(entry.recoveryTimeMs)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
