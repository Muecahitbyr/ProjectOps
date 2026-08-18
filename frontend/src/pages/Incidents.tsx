import { useMemo, useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { PageContainer } from "../components/layout/PageContainer";
import { ActiveMaintenanceBanner } from "../components/maintenance/ActiveMaintenanceBanner";
import { IncidentList } from "../components/dashboard/IncidentList";
import { RootIncidentsPanel } from "../components/incidents/RootIncidentsPanel";
import { AutomationActionsPanel } from "../components/incidents/AutomationActionsPanel";
import { StatsCard } from "../components/dashboard/StatsCard";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useIncidents } from "../hooks/useIncidents";
import { useProjectsHealth } from "../hooks/useProjects";
import { useOrganizations } from "../hooks/useOrganizations";
import { useTeams, useTeamProjects } from "../hooks/useTeams";
import { getErrorMessage } from "../utils/getErrorMessage";
import { healthStatusColors } from "../theme/statusColors";
import { deriveIncidentStatus } from "../types/incident.types";
import type { IncidentSeverity } from "../types/common.types";
import type { IncidentStatus } from "../types/incident.types";

type SeverityFilter = "ALL" | Extract<IncidentSeverity, "CRITICAL" | "HIGH">;
type StatusFilter = "ALL" | IncidentStatus;

// Stabile Referenz fuer den "noch keine Daten"-Fall - ein neues `[]` bei
// jedem Render wuerde die untenstehenden useMemo-Abhaengigkeiten (allIncidents)
// staendig invalidieren (oxlint react-hooks/exhaustive-deps).
const EMPTY_INCIDENTS: never[] = [];

function isToday(isoString: string): boolean {
  const date = new Date(isoString);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

// Phase 21 "Enterprise Alerting, Incident Response & Notification
// Orchestration" Auftragspunkt 12 "Incident Dashboard" - Open/Critical/
// Acknowledged/Resolved-Today-Kennzahlen sowie Organisation-/Team-/Projekt-
// Filter. Client-seitig gefiltert, weil GET /api/incidents (die interne,
// gemeinsame Ops-Konsole) bewusst nicht serverseitig nach Organisation/Team
// filtert - siehe Abschlussbericht "Architekturentscheidungen". Status-
// Filter erweitert um ACKNOWLEDGED (vorher nur Resolved/nicht-Resolved
// unterscheidbar ueber "Show resolved").
export function Incidents() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [projectFilter, setProjectFilter] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [teamId, setTeamId] = useState("");

  // Ein einzelner, grosszuegig limitierter Datenabruf fuer Kennzahlen UND
  // Feed - alle Filter (inkl. Status) greifen client-seitig, damit
  // "Resolved Today" korrekt bleibt unabhaengig vom Status-Filter.
  const incidentsQuery = useIncidents({ limit: 500 });
  const projectsQuery = useProjectsHealth();
  const organizationsQuery = useOrganizations();
  const teamsQuery = useTeams(organizationId || undefined);
  const teamProjectsQuery = useTeamProjects(teamId || undefined);

  const projectNames = useMemo(
    () => Object.fromEntries((projectsQuery.data ?? []).map((project) => [project.id, project.name])),
    [projectsQuery.data],
  );

  const allIncidents = incidentsQuery.data ?? EMPTY_INCIDENTS;
  const stats = useMemo(() => {
    let open = 0;
    let critical = 0;
    let acknowledged = 0;
    let resolvedToday = 0;
    for (const incident of allIncidents) {
      const status = deriveIncidentStatus(incident);
      if (status === "OPEN") open++;
      if (status === "ACKNOWLEDGED") acknowledged++;
      if (!incident.resolved && incident.severity === "CRITICAL") critical++;
      if (incident.resolvedAt && isToday(incident.resolvedAt)) resolvedToday++;
    }
    return { open, critical, acknowledged, resolvedToday };
  }, [allIncidents]);

  const teamProjectIds = useMemo(() => (teamId ? new Set(teamProjectsQuery.data ?? []) : null), [teamId, teamProjectsQuery.data]);

  const filteredIncidents = useMemo(() => {
    return allIncidents.filter((incident) => {
      if (severityFilter !== "ALL" && incident.severity !== severityFilter) return false;
      if (statusFilter !== "ALL" && deriveIncidentStatus(incident) !== statusFilter) return false;
      if (projectFilter && incident.projectId !== projectFilter) return false;
      if (teamProjectIds && !teamProjectIds.has(incident.projectId)) return false;
      return true;
    });
  }, [allIncidents, severityFilter, statusFilter, projectFilter, teamProjectIds]);

  return (
    <PageContainer title="Incidents">
      <ActiveMaintenanceBanner />
      <RootIncidentsPanel />
      <AutomationActionsPanel />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatsCard label="Open Incidents" value={stats.open} accentColor={stats.open > 0 ? healthStatusColors.critical : undefined} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatsCard label="Critical Incidents" value={stats.critical} accentColor={stats.critical > 0 ? healthStatusColors.critical : undefined} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatsCard label="Acknowledged" value={stats.acknowledged} accentColor={healthStatusColors.warning} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatsCard label="Resolved Today" value={stats.resolvedToday} accentColor={healthStatusColors.healthy} />
        </Grid>
      </Grid>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 2 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={severityFilter}
              onChange={(_event, value: SeverityFilter | null) => {
                if (value) setSeverityFilter(value);
              }}
            >
              <ToggleButton value="ALL">All severities</ToggleButton>
              <ToggleButton value="CRITICAL">Critical</ToggleButton>
              <ToggleButton value="HIGH">High</ToggleButton>
            </ToggleButtonGroup>

            <ToggleButtonGroup
              size="small"
              exclusive
              value={statusFilter}
              onChange={(_event, value: StatusFilter | null) => {
                if (value) setStatusFilter(value);
              }}
            >
              <ToggleButton value="ALL">All statuses</ToggleButton>
              <ToggleButton value="OPEN">Open</ToggleButton>
              <ToggleButton value="ACKNOWLEDGED">Acknowledged</ToggleButton>
              <ToggleButton value="RESOLVED">Resolved</ToggleButton>
            </ToggleButtonGroup>

            <TextField select size="small" label="Project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="">All projects</MenuItem>
              {(projectsQuery.data ?? []).map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Organization"
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value);
                setTeamId("");
              }}
              sx={{ minWidth: 180 }}
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
              size="small"
              label="Team"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              disabled={!organizationId}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">All teams</MenuItem>
              {(teamsQuery.data ?? []).map((team) => (
                <MenuItem key={team.id} value={team.id}>
                  {team.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {incidentsQuery.isLoading ? (
            <LoadingState label="Loading incidents..." minHeight={300} />
          ) : incidentsQuery.isError ? (
            <ErrorState message={getErrorMessage(incidentsQuery.error)} onRetry={() => incidentsQuery.refetch()} />
          ) : (
            <IncidentList
              incidents={filteredIncidents}
              projectNames={projectNames}
              emptyMessage="No incidents match the current filter."
            />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
