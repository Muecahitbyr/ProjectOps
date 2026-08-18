import { useState } from "react";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { RegisterAgentDialog } from "./RegisterAgentDialog";
import { useMonitoringAgents } from "../../hooks/useMonitoringAgents";
import { usePauseClusterAgent, useRemoveClusterAgent, useResumeClusterAgent, useRevokeClusterAgent, useRotateClusterAgentSecret } from "../../hooks/useClusterAgents";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import { useAuth } from "../../auth/AuthContext";
import type { MonitoringAgent, MonitoringAgentStatus } from "../../types/monitoring-agent.types";

const AGENT_STATUS_COLOR: Record<MonitoringAgentStatus, string> = {
  ONLINE: healthStatusColors.healthy,
  DEGRADED: healthStatusColors.warning,
  OFFLINE: healthStatusColors.critical,
};

function AgentActionsMenu({ agent }: { agent: MonitoringAgent }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const pauseMutation = usePauseClusterAgent();
  const resumeMutation = useResumeClusterAgent();
  const revokeMutation = useRevokeClusterAgent();
  const rotateMutation = useRotateClusterAgentSecret();
  const removeMutation = useRemoveClusterAgent();

  const close = (): void => setAnchorEl(null);

  return (
    <>
      <IconButton size="small" onClick={(event) => setAnchorEl(event.currentTarget)} aria-label="Agent actions">
        <MoreVertOutlinedIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        {agent.lifecycleStatus === "ACTIVE" ? (
          <MenuItem
            onClick={() => {
              pauseMutation.mutate(agent.id);
              close();
            }}
          >
            Pause
          </MenuItem>
        ) : (
          <MenuItem
            disabled={agent.lifecycleStatus === "REVOKED"}
            onClick={() => {
              resumeMutation.mutate(agent.id);
              close();
            }}
          >
            Resume
          </MenuItem>
        )}
        {agent.hasSecret ? (
          <MenuItem
            onClick={() => {
              rotateMutation.mutate(agent.id, {
                onSuccess: (result) => {
                  window.alert(`New secret for ${agent.name} (copy now, shown only once):\n\n${result.secret}`);
                },
              });
              close();
            }}
          >
            Rotate secret
          </MenuItem>
        ) : null}
        <MenuItem
          disabled={agent.lifecycleStatus === "REVOKED"}
          onClick={() => {
            revokeMutation.mutate(agent.id);
            close();
          }}
        >
          Revoke
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (window.confirm(`Remove agent "${agent.name}"? This cannot be undone.`)) {
              removeMutation.mutate(agent.id);
            }
            close();
          }}
        >
          Remove
        </MenuItem>
      </Menu>
    </>
  );
}

// Phase 14 Teil 1-3 "Remote Monitoring Agents"/"Agent Discovery" - Liste
// aller Agenten (lokal + registrierte Remote-Agenten) mit vollem
// Lebenszyklus (pausieren/reaktivieren/widerrufen/entfernen/Secret
// rotieren).
export function ClusterAgentsTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const agentsQuery = useMonitoringAgents();
  const { isGlobalAdmin } = useAuth();

  return (
    <Stack sx={{ gap: 3 }}>
      {isGlobalAdmin && (
        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setDialogOpen(true)}>
            Register agent
          </Button>
        </Stack>
      )}

      {agentsQuery.isLoading ? (
        <LoadingState label="Loading agents..." minHeight={200} />
      ) : agentsQuery.isError || !agentsQuery.data ? (
        <ErrorState message={getErrorMessage(agentsQuery.error)} onRetry={() => agentsQuery.refetch()} minHeight={200} />
      ) : agentsQuery.data.length === 0 ? (
        <EmptyState message="No agents registered." minHeight={200} />
      ) : (
        <Stack sx={{ gap: 2 }}>
          {agentsQuery.data.map((agent) => (
            <Card key={agent.id}>
              <CardContent>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
                  <Stack sx={{ minWidth: 0 }}>
                    <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Typography variant="h4">{agent.name}</Typography>
                      <Chip size="small" label={agent.status} sx={{ backgroundColor: `${AGENT_STATUS_COLOR[agent.status]}1f`, color: AGENT_STATUS_COLOR[agent.status] }} />
                      {agent.lifecycleStatus !== "ACTIVE" ? <Chip size="small" variant="outlined" label={agent.lifecycleStatus} /> : null}
                      {agent.region ? <Chip size="small" variant="outlined" label={agent.region} /> : null}
                      {agent.tags.map((tag) => (
                        <Chip key={tag} size="small" variant="outlined" label={tag} />
                      ))}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {agent.hostname} · {agent.os} · {agent.hasSecret ? "remote" : "local"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Last heartbeat {formatDateTime(agent.lastHeartbeatAt)} · {agent.checkCountLast24h} checks (24h)
                    </Typography>
                  </Stack>
                  {isGlobalAdmin ? <AgentActionsMenu agent={agent} /> : null}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <RegisterAgentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </Stack>
  );
}
