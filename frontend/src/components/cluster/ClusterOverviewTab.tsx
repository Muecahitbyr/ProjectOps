import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import DnsOutlinedIcon from "@mui/icons-material/DnsOutlined";
import { StatsCard } from "../dashboard/StatsCard";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { useClusterHealth } from "../../hooks/useCluster";
import { useMonitoringAgents } from "../../hooks/useMonitoringAgents";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import type { ClusterElectionStatus } from "../../types/cluster.types";

const ELECTION_STATUS_COLOR: Record<ClusterElectionStatus, string> = {
  STABLE: healthStatusColors.healthy,
  NO_LEADER: healthStatusColors.critical,
  SPLIT_BRAIN_SUSPECTED: healthStatusColors.critical,
};

const ELECTION_STATUS_LABEL: Record<ClusterElectionStatus, string> = {
  STABLE: "Stable",
  NO_LEADER: "No leader",
  SPLIT_BRAIN_SUSPECTED: "Split-brain suspected",
};

// Phase 14 Teil 6 "Cluster Dashboard" + Teil 11 "High Availability" -
// Widgets aus echten, laufend aktualisierten Daten (monitoring_agents/
// cluster_nodes Heartbeats, agent_assignments). "Scheduler Queue" gibt es
// in dieser Architektur nicht als echte Warteschlange (ein synchroner
// Tick alle intervalMs, siehe core/scheduler.ts) - statt eines erfundenen
// Fuellstands wird ehrlich die naechste Tick-Zeit angezeigt.
export function ClusterOverviewTab() {
  const healthQuery = useClusterHealth();
  const agentsQuery = useMonitoringAgents();

  if (healthQuery.isLoading) {
    return <LoadingState label="Loading cluster health..." minHeight={300} />;
  }
  if (healthQuery.isError || !healthQuery.data) {
    return <ErrorState message={getErrorMessage(healthQuery.error)} onRetry={() => healthQuery.refetch()} minHeight={300} />;
  }

  const health = healthQuery.data;
  const totalRam = (agentsQuery.data ?? []).reduce((sum, agent) => sum + (agent.ramMb ?? 0), 0);
  const totalDisk = (agentsQuery.data ?? []).reduce((sum, agent) => sum + (agent.diskTotalMb ?? 0), 0);

  return (
    <Stack sx={{ gap: 3 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard label="Online Agents" value={health.onlineAgents} accentColor={healthStatusColors.healthy} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Offline Agents"
            value={health.offlineAgents}
            accentColor={health.offlineAgents > 0 ? healthStatusColors.critical : undefined}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Degraded Agents"
            value={health.degradedAgents}
            accentColor={health.degradedAgents > 0 ? healthStatusColors.warning : undefined}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard label="Assigned Checks" value={`${health.assignedChecks}/${health.totalChecks}`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Distribution Strategy
              </Typography>
              <Typography variant="h3" sx={{ mt: 1.5 }}>
                {health.strategy}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 4 }}>
          <StatsCard label="Total RAM (registered agents)" value={totalRam > 0 ? `${Math.round(totalRam / 1024)} GB` : "n/a"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <StatsCard label="Total Disk (registered agents)" value={totalDisk > 0 ? `${Math.round(totalDisk / 1024)} GB` : "n/a"} />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatsCard label="Cluster Health" value={health.unassignedChecks === 0 ? "Healthy" : "Unassigned checks"} accentColor={health.unassignedChecks === 0 ? healthStatusColors.healthy : healthStatusColors.warning} />
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
            <Typography variant="h4">High Availability</Typography>
            <Chip
              size="small"
              label={ELECTION_STATUS_LABEL[health.ha.electionStatus]}
              sx={{ backgroundColor: `${ELECTION_STATUS_COLOR[health.ha.electionStatus]}1f`, color: ELECTION_STATUS_COLOR[health.ha.electionStatus] }}
            />
          </Stack>
          <List dense disablePadding>
            {health.ha.nodes.map((node) => (
              <ListItem key={node.id} disableGutters>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <DnsOutlinedIcon fontSize="small" sx={{ color: node.id === health.ha.leaderId ? healthStatusColors.healthy : "text.secondary" }} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                      <Typography variant="body2">{node.hostname}</Typography>
                      <Chip size="small" variant="outlined" label={node.role} />
                      {node.id === health.ha.leaderId ? <Chip size="small" color="success" label="Leader" /> : null}
                    </Stack>
                  }
                  secondary={`${node.status} · v${node.backendVersion} · Last heartbeat ${formatDateTime(node.lastHeartbeatAt)}`}
                />
              </ListItem>
            ))}
          </List>
          {health.ha.splitBrainSuspected ? (
            <Typography variant="caption" sx={{ color: healthStatusColors.critical, display: "block", mt: 1 }}>
              Multiple healthy PRIMARY nodes detected - manual intervention recommended.
            </Typography>
          ) : null}
        </CardContent>
      </Card>
    </Stack>
  );
}
