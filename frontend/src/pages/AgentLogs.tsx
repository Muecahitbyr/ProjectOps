import { useEffect, useState } from "react";
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
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { keyframes } from "@emotion/react";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useAgentLogs } from "../hooks/useCluster";
import { useMonitoringAgents } from "../hooks/useMonitoringAgents";
import { useProjectsHealth } from "../hooks/useProjects";
import { subscribeRealtimeEvents } from "../realtime/realtimeClient";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime } from "../utils/formatters";
import { healthStatusColors } from "../theme/statusColors";
import type { AgentLogLevel } from "../types/agent-log.types";

const LEVEL_COLOR: Record<AgentLogLevel, string> = {
  INFO: "#60a5fa",
  WARN: healthStatusColors.warning,
  ERROR: healthStatusColors.critical,
};

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

function LiveIndicator() {
  return (
    <Stack direction="row" sx={{ alignItems: "center", gap: 0.75 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: healthStatusColors.healthy, animation: `${pulse} 1.6s ease-in-out infinite` }} />
      <Typography variant="caption" color="text.secondary">
        Live
      </Typography>
    </Stack>
  );
}

// Phase 14 Teil 8 "Agent Logs" - Filter (Agent/Projekt/Check/Severity)
// gegen bereits gespeicherte Logs (GET /api/cluster/logs), zusaetzlich
// "Live Streaming ueber WebSocket": ein direktes Abonnement auf
// AGENT_LOG_CREATED (siehe realtime/realtimeClient.ts) haengt neu
// eintreffende Zeilen sofort oben an, ohne auf den naechsten Poll-
// Sicherheitsnetz-Refetch zu warten.
export function AgentLogs() {
  const [agentId, setAgentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [level, setLevel] = useState<AgentLogLevel | "">("");

  const agentsQuery = useMonitoringAgents();
  const projectsQuery = useProjectsHealth();
  const logsQuery = useAgentLogs({
    ...(agentId ? { agentId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(level ? { level } : {}),
    limit: 200,
  });

  const [liveEntries, setLiveEntries] = useState<typeof logsQuery.data>([]);

  useEffect(() => {
    setLiveEntries([]);
  }, [agentId, projectId, level]);

  useEffect(() => {
    const unsubscribe = subscribeRealtimeEvents((event) => {
      if (event.type !== "AGENT_LOG_CREATED") return;
      const entry = event.payload;
      if (agentId && entry.agentId !== agentId) return;
      if (projectId && entry.projectId !== projectId) return;
      if (level && entry.level !== level) return;
      setLiveEntries((current) => [entry, ...(current ?? [])]);
    });
    return unsubscribe;
  }, [agentId, projectId, level]);

  const agentName = (id: string): string => agentsQuery.data?.find((agent) => agent.id === id)?.name ?? id;
  const projectName = (id: string | null): string => {
    if (!id) return "—";
    return projectsQuery.data?.find((project) => project.id === id)?.name ?? id;
  };

  const liveIds = new Set((liveEntries ?? []).map((entry) => entry.id));
  const combinedEntries = [...(liveEntries ?? []), ...(logsQuery.data ?? []).filter((entry) => !liveIds.has(entry.id))];

  return (
    <PageContainer title="Agent Logs">
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2, mb: 3 }}>
        <Stack direction="row" sx={{ gap: 2, flexWrap: "wrap" }}>
          <TextField select label="Agent" size="small" value={agentId} onChange={(event) => setAgentId(event.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="">All agents</MenuItem>
            {(agentsQuery.data ?? []).map((agent) => (
              <MenuItem key={agent.id} value={agent.id}>
                {agent.name}
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
          <TextField select label="Severity" size="small" value={level} onChange={(event) => setLevel(event.target.value as AgentLogLevel | "")} sx={{ minWidth: 140 }}>
            <MenuItem value="">All severities</MenuItem>
            <MenuItem value="INFO">INFO</MenuItem>
            <MenuItem value="WARN">WARN</MenuItem>
            <MenuItem value="ERROR">ERROR</MenuItem>
          </TextField>
        </Stack>
        <LiveIndicator />
      </Stack>

      {logsQuery.isLoading ? (
        <LoadingState label="Loading agent logs..." minHeight={300} />
      ) : logsQuery.isError ? (
        <ErrorState message={getErrorMessage(logsQuery.error)} onRetry={() => logsQuery.refetch()} minHeight={300} />
      ) : combinedEntries.length === 0 ? (
        <EmptyState message="No agent logs match these filters." minHeight={300} />
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Agent</TableCell>
                <TableCell>Project</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Level</TableCell>
                <TableCell>Message</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {combinedEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell>{agentName(entry.agentId)}</TableCell>
                  <TableCell>{projectName(entry.projectId)}</TableCell>
                  <TableCell>{entry.category}</TableCell>
                  <TableCell>
                    <Chip size="small" label={entry.level} sx={{ backgroundColor: `${LEVEL_COLOR[entry.level]}1f`, color: LEVEL_COLOR[entry.level] }} />
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
