import { useNavigate } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Paper from "@mui/material/Paper";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useAuditLog } from "../../hooks/useAudit";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";

// Phase 15 Teil 9 "Global Administration" (Global-Audit-Tab) - nutzt
// bewusst denselben GET /api/audit-log wieder, den bereits das Audit
// Center (Phase 13) verwendet, statt eine zweite Audit-Ansicht zu bauen
// ("keine Parallelimplementierungen"). Diese kompakte Vorschau verlinkt auf
// die vollstaendige, bereits bestehende Filteroberflaeche.
export function GlobalAuditTab() {
  const navigate = useNavigate();
  const auditQuery = useAuditLog({ limit: 20 });

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <Button size="small" endIcon={<OpenInNewOutlinedIcon fontSize="small" />} onClick={() => navigate("/audit")}>
          Open full Audit Center
        </Button>
      </Stack>
      {auditQuery.isLoading ? (
        <LoadingState label="Loading audit log..." minHeight={200} />
      ) : auditQuery.isError || !auditQuery.data ? (
        <ErrorState message={getErrorMessage(auditQuery.error)} onRetry={() => auditQuery.refetch()} minHeight={200} />
      ) : auditQuery.data.length === 0 ? (
        <EmptyState message="No audit events yet." minHeight={200} />
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Message</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditQuery.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell>{entry.category}</TableCell>
                  <TableCell>{entry.severity}</TableCell>
                  <TableCell>{entry.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
