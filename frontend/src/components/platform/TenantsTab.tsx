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
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useOrganizations } from "../../hooks/useOrganizations";
import { useTeams } from "../../hooks/useTeams";
import { useTenantAnalytics } from "../../hooks/usePlatform";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatPercent, formatResponseTime } from "../../utils/formatters";

// Phase 15 Teil 8 "Tenant Analytics" - aus bereits bestehenden Tabellen
// abgeleitet (Incidents/Alerts/Automation/Notifications/Check-Ergebnisse),
// filterbar nach Organisation und Team (siehe tenant-analytics.repository.ts).
// Der Team-Filter ist nur waehlbar, wenn zuvor eine Organisation gewaehlt
// wurde, da ein Team immer zu genau einer Organisation gehoert.
export function TenantsTab() {
  const [organizationId, setOrganizationId] = useState("");
  const [teamId, setTeamId] = useState("");
  const organizationsQuery = useOrganizations();
  const teamsQuery = useTeams(organizationId || undefined);
  const analyticsQuery = useTenantAnalytics(organizationId || undefined, teamId || undefined);

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack direction="row" sx={{ gap: 2, flexWrap: "wrap" }}>
        <TextField
          select
          label="Organization"
          size="small"
          value={organizationId}
          onChange={(event) => {
            setOrganizationId(event.target.value);
            setTeamId("");
          }}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All organizations</MenuItem>
          {(organizationsQuery.data ?? []).map((org) => (
            <MenuItem key={org.id} value={org.id}>
              {org.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Team"
          size="small"
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
          disabled={!organizationId}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All teams</MenuItem>
          {(teamsQuery.data ?? []).map((team) => (
            <MenuItem key={team.id} value={team.id}>
              {team.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {analyticsQuery.isLoading ? (
        <LoadingState label="Loading tenant analytics..." minHeight={200} />
      ) : analyticsQuery.isError || !analyticsQuery.data ? (
        <ErrorState message={getErrorMessage(analyticsQuery.error)} onRetry={() => analyticsQuery.refetch()} minHeight={200} />
      ) : analyticsQuery.data.length === 0 ? (
        <EmptyState message="No organizations yet." minHeight={200} />
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Organization</TableCell>
                <TableCell align="right">Projects</TableCell>
                <TableCell align="right">Incidents (30d)</TableCell>
                <TableCell align="right">Alerts (30d)</TableCell>
                <TableCell align="right">Automation (30d)</TableCell>
                <TableCell align="right">Health</TableCell>
                <TableCell align="right">Avg Response</TableCell>
                <TableCell align="right">Notifications</TableCell>
                <TableCell align="right">API Usage</TableCell>
                <TableCell align="right">Records Stored</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {analyticsQuery.data.map((tenant) => (
                <TableRow key={tenant.organizationId}>
                  <TableCell>{tenant.organizationName}</TableCell>
                  <TableCell align="right">{tenant.projectCount}</TableCell>
                  <TableCell align="right">{tenant.incidentCount}</TableCell>
                  <TableCell align="right">{tenant.alertCount}</TableCell>
                  <TableCell align="right">{tenant.automationExecutionCount}</TableCell>
                  <TableCell align="right">{tenant.averageHealthScore === null ? "n/a" : formatPercent(tenant.averageHealthScore)}</TableCell>
                  <TableCell align="right">{formatResponseTime(tenant.averageResponseTimeMs)}</TableCell>
                  <TableCell align="right">{tenant.notificationCount}</TableCell>
                  <TableCell align="right">{tenant.apiUsageCount}</TableCell>
                  <TableCell align="right">{tenant.recordsStored.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
