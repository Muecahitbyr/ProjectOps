import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { TopologyGraphView } from "../components/platform/TopologyGraphView";
import { useOrganizations } from "../hooks/useOrganizations";
import { useTeams } from "../hooks/useTeams";
import { useTopology } from "../hooks/useServices";
import { getErrorMessage } from "../utils/getErrorMessage";

// Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
// Intelligence" Auftragspunkt 12/15 "Topology Graph"/"Topology
// Intelligence".
export function Topology() {
  const navigate = useNavigate();
  const [organizationId, setOrganizationId] = useState("");
  const [teamId, setTeamId] = useState("");

  const organizationsQuery = useOrganizations();
  const teamsQuery = useTeams(organizationId || undefined);
  const topologyQuery = useTopology(organizationId || undefined, teamId || undefined);

  return (
    <PageContainer title="Service Topology">
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" sx={{ gap: 2, flexWrap: "wrap" }}>
            <TextField
              select
              size="small"
              label="Organization"
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value);
                setTeamId("");
              }}
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="">Select an organization</MenuItem>
              {(organizationsQuery.data ?? []).map((org) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Team" value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={!organizationId} sx={{ minWidth: 180 }}>
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
          {!organizationId ? (
            <Typography color="text.secondary">Select an organization to view its service topology.</Typography>
          ) : topologyQuery.isLoading ? (
            <LoadingState label="Loading topology..." minHeight={300} />
          ) : topologyQuery.isError ? (
            <ErrorState message={getErrorMessage(topologyQuery.error)} onRetry={() => topologyQuery.refetch()} />
          ) : (
            <>
              {topologyQuery.data?.truncated ? (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  This organization has more services than can be displayed at once - showing a truncated view.
                </Alert>
              ) : null}
              <TopologyGraphView
                nodes={topologyQuery.data?.nodes ?? []}
                edges={topologyQuery.data?.edges ?? []}
                onSelectNode={(id) => navigate(`/platform/services/${id}`)}
              />
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
