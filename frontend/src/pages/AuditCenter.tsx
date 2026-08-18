import { useState } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useAuditLog } from "../hooks/useAudit";
import { useUsers } from "../hooks/useUsers";
import { useProjectsHealth } from "../hooks/useProjects";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime } from "../utils/formatters";
import { severityColors } from "../theme/statusColors";
import type { AuditCategory, AuditSeverity } from "../types/audit.types";

// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk" - live gefundener Bug: ON_CALL (Phase 24), DEPLOYMENT (Phase 27) und
// jetzt CHANGE fehlten hier, obwohl routes/audit.routes.ts (nach dem Fix
// dort) und der AuditCategory-Unionstyp sie laengst kennen - dieselbe
// "TS-Union aktualisiert, Verbraucher vergessen"-Fehlerklasse wie bei
// api-scope.types.ts (siehe dortiger Kommentar).
const CATEGORIES: AuditCategory[] = ["AUTH", "ALERT", "AUTOMATION", "NOTIFICATION", "INCIDENT", "MAINTENANCE", "BACKUP", "USER", "SYSTEM", "SLO", "SERVICE", "ON_CALL", "DEPLOYMENT", "CHANGE", "PROBLEM"];
const SEVERITIES: AuditSeverity[] = ["INFO", "WARNING", "CRITICAL"];

const SEVERITY_COLOR: Record<AuditSeverity, string> = {
  INFO: "#60a5fa",
  WARNING: severityColors.MEDIUM,
  CRITICAL: severityColors.CRITICAL,
};

// Phase 13 Teil 7 "Audit Center" - nur fuer OWNER/ADMIN (siehe
// routes/audit.routes.ts: authorizeGlobalAdmin). Filter: User, Projekt,
// Kategorie, Schweregrad. "Zeitraum" ist bewusst als Anzahl geladener
// Eintraege (limit) statt eines separaten Datumsbereichs umgesetzt, da
// listAuditLog() bereits absteigend nach Zeit sortiert.
export function AuditCenter() {
  const [userId, setUserId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState<AuditCategory | "">("");
  const [severity, setSeverity] = useState<AuditSeverity | "">("");
  const [limit, setLimit] = useState(100);

  const usersQuery = useUsers();
  const projectsQuery = useProjectsHealth();
  const auditQuery = useAuditLog({
    ...(userId ? { userId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(category ? { category } : {}),
    ...(severity ? { severity } : {}),
    limit,
  });

  const userName = (id: string | null): string => {
    if (!id) return "System";
    return usersQuery.data?.find((user) => user.id === id)?.name ?? id;
  };
  const projectName = (id: string | null): string => {
    if (!id) return "—";
    return projectsQuery.data?.find((project) => project.id === id)?.name ?? id;
  };

  return (
    <PageContainer title="Audit Center">
      <Stack direction="row" sx={{ gap: 2, flexWrap: "wrap", mb: 3 }}>
        <TextField select label="User" size="small" value={userId} onChange={(event) => setUserId(event.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All users</MenuItem>
          {(usersQuery.data ?? []).map((user) => (
            <MenuItem key={user.id} value={user.id}>
              {user.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Project" size="small" value={projectId} onChange={(event) => setProjectId(event.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All projects</MenuItem>
          {(projectsQuery.data ?? []).map((project) => (
            <MenuItem key={project.id} value={project.id}>
              {project.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Category"
          size="small"
          value={category}
          onChange={(event) => setCategory(event.target.value as AuditCategory | "")}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All categories</MenuItem>
          {CATEGORIES.map((entry) => (
            <MenuItem key={entry} value={entry}>
              {entry}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Severity"
          size="small"
          value={severity}
          onChange={(event) => setSeverity(event.target.value as AuditSeverity | "")}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All severities</MenuItem>
          {SEVERITIES.map((entry) => (
            <MenuItem key={entry} value={entry}>
              {entry}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Show" size="small" value={limit} onChange={(event) => setLimit(Number(event.target.value))} sx={{ minWidth: 120 }}>
          <MenuItem value={50}>Last 50</MenuItem>
          <MenuItem value={100}>Last 100</MenuItem>
          <MenuItem value={250}>Last 250</MenuItem>
          <MenuItem value={500}>Last 500</MenuItem>
        </TextField>
      </Stack>

      {auditQuery.isLoading ? (
        <LoadingState label="Loading audit log..." minHeight={300} />
      ) : auditQuery.isError || !auditQuery.data ? (
        <ErrorState message={getErrorMessage(auditQuery.error)} onRetry={() => auditQuery.refetch()} minHeight={300} />
      ) : auditQuery.data.length === 0 ? (
        <EmptyState message="No audit events match these filters." minHeight={300} />
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Project</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Message</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditQuery.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell>{userName(entry.userId)}</TableCell>
                  <TableCell>{projectName(entry.projectId)}</TableCell>
                  <TableCell>{entry.category}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={entry.severity}
                      sx={{ backgroundColor: `${SEVERITY_COLOR[entry.severity]}1f`, color: SEVERITY_COLOR[entry.severity] }}
                    />
                  </TableCell>
                  <TableCell>{entry.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </PageContainer>
  );
}
