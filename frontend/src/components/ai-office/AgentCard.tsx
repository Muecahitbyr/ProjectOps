import { memo } from "react";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Avatar from "@mui/material/Avatar";
import Tooltip from "@mui/material/Tooltip";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import { AGENT_STATUS_COLOR, AGENT_STATUS_LABEL } from "./officeConfig";
import type { AgentSnapshot } from "./officeConfig";
import { formatRelativeTime } from "../../utils/formatters";

interface AgentCardProps {
  agent: AgentSnapshot;
  onSelect: (agent: AgentSnapshot) => void;
}

// Letzte ECHTE Aktivitaet dieses Agenten - die juengste vorhandene
// Action-/Execution-createdAt, oder null, wenn nie ein Vorgang existierte
// (dann bleibt der Agent ehrlich als "Idle, no activity yet" erkennbar,
// keine erfundene Zeitangabe).
function lastActivityIso(agent: AgentSnapshot): string | null {
  return agent.latestExecution?.createdAt ?? agent.latestAction?.createdAt ?? null;
}

// Eine "Arbeitsplatz"-Karte je echter Automation Rule (Phase 11) - Name,
// Aktion und Trigger stammen 1:1 aus der Regel, der Status ausschliesslich
// aus buildAgentSnapshots() (officeConfig.ts), keine erfundenen Werte.
//
// Phase 2 "Polish" - memo()isiert (siehe DepartmentBoard.tsx), Tooltip zeigt
// die aktuelle Aufgabe/letzte Aktivitaet ausschliesslich aus bereits
// geladenen Feldern (keine Zusatzabfrage beim Hover).
export const AgentCard = memo(function AgentCard({ agent, onSelect }: AgentCardProps) {
  const color = AGENT_STATUS_COLOR[agent.status];
  const pulsing = agent.status === "WORKING";
  const lastActivity = lastActivityIso(agent);

  const tooltip = (
    <Box>
      <Typography variant="caption" sx={{ display: "block", fontWeight: 600 }}>
        {AGENT_STATUS_LABEL[agent.status]}
      </Typography>
      {agent.latestAction ? (
        <Typography variant="caption" sx={{ display: "block" }}>
          Current task: {agent.latestAction.action.replace(/_/g, " ").toLowerCase()}
        </Typography>
      ) : (
        <Typography variant="caption" sx={{ display: "block" }}>
          No task yet
        </Typography>
      )}
      <Typography variant="caption" sx={{ display: "block", opacity: 0.8 }}>
        {lastActivity ? `Last active ${formatRelativeTime(lastActivity)}` : "No activity recorded yet"}
      </Typography>
    </Box>
  );

  return (
    <Tooltip title={tooltip} enterDelay={400} placement="top-start">
      <Card
        variant="outlined"
        sx={{
          borderColor: `${color}55`,
          transition: "border-color 0.2s ease, transform 0.15s ease",
          "&:hover": { borderColor: color, transform: "translateY(-2px)" },
        }}
      >
        <CardActionArea onClick={() => onSelect(agent)}>
          <CardContent sx={{ py: 1.5 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Box sx={{ position: "relative" }}>
                <Avatar sx={{ bgcolor: `${color}22`, color, width: 36, height: 36 }}>
                  <SmartToyOutlinedIcon fontSize="small" />
                </Avatar>
                <Box
                  sx={{
                    position: "absolute",
                    bottom: -2,
                    right: -2,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: color,
                    border: "2px solid",
                    borderColor: "background.paper",
                    ...(pulsing ? { animation: "office-pulse 1.4s ease-in-out infinite" } : {}),
                    "@keyframes office-pulse": {
                      "0%": { boxShadow: `0 0 0 0 ${color}66` },
                      "70%": { boxShadow: `0 0 0 6px ${color}00` },
                      "100%": { boxShadow: `0 0 0 0 ${color}00` },
                    },
                  }}
                />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {agent.rule.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {agent.rule.action.replace(/_/g, " ").toLowerCase()}
                </Typography>
              </Box>
              <Chip size="small" label={AGENT_STATUS_LABEL[agent.status]} sx={{ backgroundColor: `${color}1f`, color, fontWeight: 600, flexShrink: 0 }} />
            </Stack>
          </CardContent>
        </CardActionArea>
      </Card>
    </Tooltip>
  );
});
