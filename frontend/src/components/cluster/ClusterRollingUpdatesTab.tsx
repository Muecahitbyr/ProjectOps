import { useState } from "react";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useMonitoringAgents } from "../../hooks/useMonitoringAgents";
import { useCreateRollingUpdate, useRollingUpdates, useTransitionRollingUpdate } from "../../hooks/useRollingUpdates";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import { ROLLING_UPDATE_TRANSITIONS } from "../../types/rolling-update.types";
import { useAuth } from "../../auth/AuthContext";
import type { RollingUpdateStatus } from "../../types/rolling-update.types";

const STATUS_COLOR: Record<RollingUpdateStatus, string> = {
  PENDING: "#64748b",
  DOWNLOADING: "#3b82f6",
  INSTALLING: "#3b82f6",
  RESTARTING: "#f59e0b",
  HEALTHY: healthStatusColors.healthy,
  FAILED: healthStatusColors.critical,
  ROLLED_BACK: "#f97316",
};

// Phase 14 Teil 9 "Rolling Updates" - reine Statusverwaltung (kein echter
// Download, siehe Auftrag): jeder Button loest genau den naechsten in
// ROLLING_UPDATE_TRANSITIONS erlaubten Uebergang aus.
export function ClusterRollingUpdatesTab() {
  const [agentId, setAgentId] = useState("");
  const [targetVersion, setTargetVersion] = useState("");
  const agentsQuery = useMonitoringAgents();
  const updatesQuery = useRollingUpdates();
  const createMutation = useCreateRollingUpdate();
  const transitionMutation = useTransitionRollingUpdate();
  const { isGlobalAdmin } = useAuth();

  const agentName = (id: string): string => agentsQuery.data?.find((agent) => agent.id === id)?.name ?? id;

  const handleCreate = (): void => {
    if (!agentId || !targetVersion.trim()) return;
    createMutation.mutate(
      { agentId, targetVersion: targetVersion.trim() },
      { onSuccess: () => setTargetVersion("") },
    );
  };

  return (
    <Stack sx={{ gap: 3 }}>
      {isGlobalAdmin && (
      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 2 }}>
            Start rolling update
          </Typography>
          <Stack direction="row" sx={{ gap: 2, flexWrap: "wrap", alignItems: "center" }}>
            <TextField select label="Agent" size="small" value={agentId} onChange={(event) => setAgentId(event.target.value)} sx={{ minWidth: 220 }}>
              {(agentsQuery.data ?? []).map((agent) => (
                <MenuItem key={agent.id} value={agent.id}>
                  {agent.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Target version"
              size="small"
              value={targetVersion}
              onChange={(event) => setTargetVersion(event.target.value)}
              placeholder="e.g. 1.2.0"
            />
            <Button variant="contained" onClick={handleCreate} disabled={!agentId || !targetVersion.trim() || createMutation.isPending}>
              Create
            </Button>
          </Stack>
        </CardContent>
      </Card>
      )}

      {updatesQuery.isLoading ? (
        <LoadingState label="Loading rolling updates..." minHeight={160} />
      ) : updatesQuery.isError || !updatesQuery.data ? (
        <ErrorState message={getErrorMessage(updatesQuery.error)} onRetry={() => updatesQuery.refetch()} minHeight={160} />
      ) : updatesQuery.data.length === 0 ? (
        <EmptyState message="No rolling updates yet." minHeight={160} />
      ) : (
        <Stack sx={{ gap: 2 }}>
          {updatesQuery.data.map((update) => {
            const nextStatuses = ROLLING_UPDATE_TRANSITIONS[update.status];
            return (
              <Card key={update.id}>
                <CardContent>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                    <Stack>
                      <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                        <Typography variant="body1">
                          {agentName(update.agentId)} → v{update.targetVersion}
                        </Typography>
                        <Chip size="small" label={update.status} sx={{ backgroundColor: `${STATUS_COLOR[update.status]}1f`, color: STATUS_COLOR[update.status] }} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Created {formatDateTime(update.createdAt)}
                        {update.finishedAt ? ` · Finished ${formatDateTime(update.finishedAt)}` : ""}
                      </Typography>
                      {update.error ? (
                        <Typography variant="caption" sx={{ color: healthStatusColors.critical, display: "block" }}>
                          {update.error}
                        </Typography>
                      ) : null}
                    </Stack>
                    <Stack direction="row" sx={{ gap: 1 }}>
                      {isGlobalAdmin && nextStatuses.map((status) => (
                        <Button
                          key={status}
                          size="small"
                          variant="outlined"
                          disabled={transitionMutation.isPending}
                          onClick={() => transitionMutation.mutate({ id: update.id, status })}
                        >
                          {status}
                        </Button>
                      ))}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
