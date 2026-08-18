import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import { DEPARTMENTS } from "./officeConfig";
import type { AgentSnapshot } from "./officeConfig";
import { formatRelativeTime } from "../../utils/formatters";

interface LiveActivityStripProps {
  workingAgents: AgentSnapshot[];
  onSelectAgent: (agent: AgentSnapshot) => void;
}

const DEPARTMENT_BY_ID = new Map(DEPARTMENTS.map((d) => [d.id, d]));

// Direkt beantwortet: "Wer arbeitet gerade woran?" - eine abteilungs-
// uebergreifende Zeile ausschliesslich echter, aktuell WORKING-Agenten
// (officeConfig.ts#buildAgentSnapshots). Bewusst KEIN Platzhalter/erfundener
// Eintrag, wenn niemand arbeitet - dann ein ruhiger, ehrlicher Hinweis statt
// vorgetaeuschter Aktivitaet.
export function LiveActivityStrip({ workingAgents, onSelectAgent }: LiveActivityStripProps) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ mb: workingAgents.length > 0 ? 1.5 : 0, alignItems: "center" }}>
          <BoltOutlinedIcon fontSize="small" sx={{ color: "#3b82f6" }} />
          <Typography variant="h4">Working Right Now</Typography>
          {workingAgents.length > 0 ? (
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#3b82f6",
                animation: "office-strip-pulse 1.4s ease-in-out infinite",
                "@keyframes office-strip-pulse": { "0%": { opacity: 1 }, "50%": { opacity: 0.3 }, "100%": { opacity: 1 } },
              }}
            />
          ) : null}
        </Stack>
        {workingAgents.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            All agents are idle right now - nothing is actively executing.
          </Typography>
        ) : (
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", rowGap: 1.5 }}>
            {workingAgents.map((agent) => {
              const dept = DEPARTMENT_BY_ID.get(agent.department);
              const startedAt = agent.latestExecution?.startedAt ?? agent.latestAction?.createdAt ?? null;
              return (
                <Box
                  key={agent.rule.id}
                  onClick={() => onSelectAgent(agent)}
                  sx={{
                    cursor: "pointer",
                    borderRadius: 1.5,
                    border: "1px solid",
                    borderColor: "divider",
                    borderLeftWidth: 3,
                    borderLeftColor: dept?.accentColor ?? "#3b82f6",
                    px: 1.5,
                    py: 1,
                    minWidth: 200,
                    transition: "background-color 0.15s ease",
                    "&:hover": { backgroundColor: "action.hover" },
                  }}
                >
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {agent.rule.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap component="div">
                    {dept?.name} · {agent.rule.action.replace(/_/g, " ").toLowerCase()}
                  </Typography>
                  {startedAt ? (
                    <Typography variant="caption" color="text.disabled">
                      since {formatRelativeTime(startedAt)}
                    </Typography>
                  ) : null}
                </Box>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
