import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useDiagnosticsSnapshot, useDisasterRecoveryReport } from "../hooks/useDiagnostics";
import { useMonitoringAgents } from "../hooks/useMonitoringAgents";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime, formatDuration } from "../utils/formatters";
import { healthStatusColors } from "../theme/statusColors";
import type { DisasterRecoveryStatus } from "../types/diagnostics.types";
import type { MonitoringAgentStatus } from "../types/monitoring-agent.types";

const DR_STATUS_COLOR: Record<DisasterRecoveryStatus, string> = {
  HEALTHY: healthStatusColors.healthy,
  DEGRADED: healthStatusColors.warning,
  CRITICAL: healthStatusColors.critical,
};

const AGENT_STATUS_COLOR: Record<MonitoringAgentStatus, string> = {
  ONLINE: healthStatusColors.healthy,
  DEGRADED: healthStatusColors.warning,
  OFFLINE: healthStatusColors.critical,
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2, py: 0.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
        {value}
      </Typography>
    </Stack>
  );
}

// Phase 13 Teil 11 "Diagnostics Center" - jeder Wert stammt live aus dem
// laufenden Backend-Prozess (core/diagnostics.ts), nichts ist hartkodiert.
// Enthaelt zusaetzlich Disaster-Recovery-Status (Teil 9) und die registrierten
// Monitoring Agents (Teil 1) - beides technische, admin-only Betriebsdaten,
// fuer die der Auftrag keine eigene Seite vorsieht.
export function DiagnosticsCenter() {
  const diagnosticsQuery = useDiagnosticsSnapshot();
  const disasterRecoveryQuery = useDisasterRecoveryReport();
  const agentsQuery = useMonitoringAgents();

  return (
    <PageContainer title="Diagnostics Center">
      {diagnosticsQuery.isLoading ? (
        <LoadingState label="Loading diagnostics..." minHeight={300} />
      ) : diagnosticsQuery.isError || !diagnosticsQuery.data ? (
        <ErrorState message={getErrorMessage(diagnosticsQuery.error)} onRetry={() => diagnosticsQuery.refetch()} minHeight={300} />
      ) : (
        <Stack sx={{ gap: 3 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 1 }}>
                    System
                  </Typography>
                  <InfoRow label="Backend version" value={diagnosticsQuery.data.backendVersion} />
                  <InfoRow label="Frontend version" value={diagnosticsQuery.data.frontendVersion ?? "unknown"} />
                  <InfoRow label="Git commit" value={diagnosticsQuery.data.gitCommit ?? "unknown"} />
                  <InfoRow label="Environment" value={diagnosticsQuery.data.environment} />
                  <InfoRow label="Node.js" value={diagnosticsQuery.data.nodeVersion} />
                  <InfoRow label="Platform" value={`${diagnosticsQuery.data.platform} (${diagnosticsQuery.data.arch})`} />
                  <InfoRow label="Docker" value={diagnosticsQuery.data.dockerized ? diagnosticsQuery.data.dockerVersion ?? "yes" : "no"} />
                  <InfoRow label="PostgreSQL" value={diagnosticsQuery.data.postgresVersion?.split(",")[0] ?? "unknown"} />
                  <InfoRow label="Uptime" value={formatDuration(diagnosticsQuery.data.uptimeSeconds * 1000)} />
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 1 }}>
                    Resources
                  </Typography>
                  <InfoRow label="Heap used" value={`${diagnosticsQuery.data.memory.usedMb} MB`} />
                  <InfoRow label="Heap total" value={`${diagnosticsQuery.data.memory.totalMb} MB`} />
                  <InfoRow label="RSS" value={`${diagnosticsQuery.data.memory.rssMb} MB`} />
                  <InfoRow label="CPU load" value={diagnosticsQuery.data.cpuLoadPercent === null ? "unknown" : `${diagnosticsQuery.data.cpuLoadPercent}%`} />
                </CardContent>
              </Card>
              <Card sx={{ mt: 2 }}>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 1 }}>
                    Subsystems
                  </Typography>
                  <List dense disablePadding>
                    {diagnosticsQuery.data.subsystems.map((subsystem) => (
                      <ListItem key={subsystem.name} disableGutters>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          {subsystem.healthy ? (
                            <CheckCircleOutlineIcon fontSize="small" sx={{ color: healthStatusColors.healthy }} />
                          ) : (
                            <ErrorOutlineOutlinedIcon fontSize="small" sx={{ color: healthStatusColors.critical }} />
                          )}
                        </ListItemIcon>
                        <ListItemText primary={subsystem.name} secondary={subsystem.detail} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="h4">Disaster Recovery</Typography>
                {disasterRecoveryQuery.data ? (
                  <Chip
                    size="small"
                    label={disasterRecoveryQuery.data.status}
                    sx={{
                      backgroundColor: `${DR_STATUS_COLOR[disasterRecoveryQuery.data.status]}1f`,
                      color: DR_STATUS_COLOR[disasterRecoveryQuery.data.status],
                    }}
                  />
                ) : null}
              </Stack>
              {disasterRecoveryQuery.isLoading ? (
                <LoadingState label="Loading..." minHeight={80} />
              ) : disasterRecoveryQuery.isError || !disasterRecoveryQuery.data ? (
                <ErrorState message={getErrorMessage(disasterRecoveryQuery.error)} minHeight={80} />
              ) : (
                <List dense disablePadding>
                  {disasterRecoveryQuery.data.signals.map((signal) => (
                    <ListItem key={signal.name} disableGutters>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {signal.healthy ? (
                          <CheckCircleOutlineIcon fontSize="small" sx={{ color: healthStatusColors.healthy }} />
                        ) : (
                          <ErrorOutlineOutlinedIcon fontSize="small" sx={{ color: healthStatusColors.critical }} />
                        )}
                      </ListItemIcon>
                      <ListItemText primary={signal.name} secondary={signal.detail} />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1.5 }}>
                Monitoring Agents
              </Typography>
              {agentsQuery.isLoading ? (
                <LoadingState label="Loading..." minHeight={80} />
              ) : agentsQuery.isError || !agentsQuery.data ? (
                <ErrorState message={getErrorMessage(agentsQuery.error)} minHeight={80} />
              ) : agentsQuery.data.length === 0 ? (
                <EmptyState message="No monitoring agents registered." minHeight={80} />
              ) : (
                <Stack sx={{ gap: 1.5 }}>
                  {agentsQuery.data.map((agent) => (
                    <Stack key={agent.id} direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                      <Stack>
                        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                          <Typography variant="body1">{agent.name}</Typography>
                          <Chip
                            size="small"
                            label={agent.status}
                            sx={{ backgroundColor: `${AGENT_STATUS_COLOR[agent.status]}1f`, color: AGENT_STATUS_COLOR[agent.status] }}
                          />
                          {agent.region ? <Chip size="small" variant="outlined" label={agent.region} /> : null}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {agent.hostname} · {agent.os} · {agent.cpuInfo ?? "CPU unknown"} · {agent.ramMb ? `${Math.round(agent.ramMb / 1024)} GB RAM` : "RAM unknown"}
                        </Typography>
                      </Stack>
                      <Stack sx={{ textAlign: "right" }}>
                        <Typography variant="body2">{agent.checkCountLast24h} checks (24h)</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Last heartbeat {formatDateTime(agent.lastHeartbeatAt)}
                        </Typography>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Stack>
      )}
    </PageContainer>
  );
}
