import { memo } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import { OfficeCharacter } from "./OfficeCharacter";
import { AGENT_STATUS_LABEL } from "./officeConfig";
import type { DepartmentConfig, AgentSnapshot } from "./officeConfig";
import { severityColors } from "../../theme/statusColors";
import { formatRelativeTime } from "../../utils/formatters";
import type { AttentionItem, AttentionTier } from "../../types/attention.types";

interface OfficeRoomProps {
  department: DepartmentConfig;
  agents: AgentSnapshot[];
  tasks: AttentionItem[];
  onSelectAgent: (agent: AgentSnapshot) => void;
  onSelectTask: (task: AttentionItem) => void;
}

const TIER_RANK: Record<AttentionTier, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

function worstTier(tasks: AttentionItem[]): AttentionTier | null {
  if (tasks.length === 0) return null;
  return tasks.reduce<AttentionTier>((worst, t) => (TIER_RANK[t.tier] > TIER_RANK[worst] ? t.tier : worst), tasks[0]!.tier);
}

// Echter, kurzer Sprechblasen-Text ausschliesslich aus bereits geladenen
// Feldern des Agenten (Regelname/Aktion/letzte Ausfuehrung) - keine erfundene
// Konversation. Nur fuer Agenten mit tatsaechlich sichtbarem, aktuellem
// Vorgang gerendert.
function speechFor(agent: AgentSnapshot): string | null {
  if (agent.status === "WORKING") return agent.rule.action.replace(/_/g, " ").toLowerCase();
  if (agent.status === "WAITING") return "wartet auf Freigabe...";
  if (agent.status === "BLOCKED") return agent.latestExecution?.error ? agent.latestExecution.error.slice(0, 40) : "blockiert";
  return null;
}

// Ein "Raum" je Abteilung - isometrisch texturierter Boden (reines CSS,
// kein Bild-Asset), echte Charaktere je Automation Rule (Phase 11) an
// Schreibtisch-Plattformen, Sprechblase nur bei echter aktueller
// Aktivitaet. Leere Abteilungen zeigen ehrlich einen leeren Boden statt
// erfundener Mitarbeiter.
const OfficeRoom = memo(function OfficeRoom({ department, agents, tasks, onSelectAgent, onSelectTask }: OfficeRoomProps) {
  const tier = worstTier(tasks);
  const workingCount = agents.filter((a) => a.status === "WORKING").length;

  return (
    <Box
      sx={{
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        minHeight: 220,
      }}
    >
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 1.5, py: 1, backgroundColor: "background.paper" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: department.accentColor, flexShrink: 0 }} />
          <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>
            {department.name}
          </Typography>
          {workingCount > 0 ? (
            <Chip size="small" label={`${workingCount} aktiv`} sx={{ height: 18, fontSize: "0.65rem", backgroundColor: "#3b82f61f", color: "#3b82f6", fontWeight: 700 }} />
          ) : null}
        </Stack>
        {tier ? (
          <Chip size="small" label={`${tasks.length} offen`} sx={{ height: 18, fontSize: "0.65rem", backgroundColor: `${severityColors[tier]}1f`, color: severityColors[tier], fontWeight: 700 }} />
        ) : (
          <Chip size="small" label="frei" sx={{ height: 18, fontSize: "0.65rem", backgroundColor: "action.hover", fontWeight: 700 }} />
        )}
      </Stack>

      {/* Isometrisch wirkender Boden - reines CSS-Muster, kein Bild-Asset */}
      <Box
        sx={{
          position: "relative",
          flex: 1,
          minHeight: 160,
          backgroundColor: "#20242c",
          backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.035) 0 14px, rgba(255,255,255,0.07) 14px 16px)`,
          display: "flex",
          flexWrap: "wrap",
          alignContent: "flex-end",
          gap: 2.5,
          px: 2.5,
          py: 2,
        }}
      >
        {agents.length === 0 ? (
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.35)", m: "auto" }}>
            Keine Agenten dieser Abteilung zugeordnet.
          </Typography>
        ) : (
          agents.map((agent) => {
            const speech = speechFor(agent);
            return (
              <Box key={agent.rule.id} sx={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
                {speech ? (
                  <Box
                    sx={{
                      position: "absolute",
                      bottom: "100%",
                      mb: 0.5,
                      maxWidth: 130,
                      backgroundColor: "background.paper",
                      color: "text.primary",
                      borderRadius: "10px 10px 10px 2px",
                      px: 1,
                      py: 0.5,
                      boxShadow: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    <Typography variant="caption" sx={{ fontSize: "0.65rem", fontWeight: 600 }}>
                      {speech}
                    </Typography>
                  </Box>
                ) : null}

                <OfficeCharacter
                  status={agent.status}
                  color={department.accentColor}
                  label={agent.rule.name}
                  onClick={() => onSelectAgent(agent)}
                  tooltip={
                    <Box>
                      <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
                        {agent.rule.name}
                      </Typography>
                      <Typography variant="caption" sx={{ display: "block" }}>
                        {AGENT_STATUS_LABEL[agent.status]}
                      </Typography>
                    </Box>
                  }
                />
                {/* Schreibtisch-Plattform - Trapez per clip-path fuer eine leichte 3D-Andeutung */}
                <Box
                  sx={{
                    width: 44,
                    height: 10,
                    mt: -0.5,
                    backgroundColor: "rgba(255,255,255,0.12)",
                    clipPath: "polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)",
                  }}
                />
                <Typography variant="caption" noWrap sx={{ mt: 0.5, maxWidth: 60, fontSize: "0.6rem", color: "rgba(255,255,255,0.55)", textAlign: "center" }}>
                  {agent.rule.name}
                </Typography>
              </Box>
            );
          })
        )}
      </Box>

      {tasks.length > 0 ? (
        <Stack spacing={0.5} sx={{ px: 1.5, py: 1, backgroundColor: "background.paper", borderTop: "1px solid", borderColor: "divider" }}>
          {tasks.slice(0, 2).map((task) => (
            <Box
              key={`${task.kind}-${task.entityId}-${task.title}`}
              onClick={() => onSelectTask(task)}
              sx={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 1, "&:hover": { opacity: 0.75 } }}
            >
              <Typography variant="caption" noWrap sx={{ flex: 1 }}>
                {task.title}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                {task.createdAt ? formatRelativeTime(task.createdAt) : ""}
              </Typography>
            </Box>
          ))}
          {tasks.length > 2 ? (
            <Typography variant="caption" color="text.disabled">
              +{tasks.length - 2} weitere
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
});

interface OfficeFloorSceneProps {
  departments: DepartmentConfig[];
  agentsByDepartment: Map<string, AgentSnapshot[]>;
  tasksByDepartment: Map<string, AttentionItem[]>;
  onSelectAgent: (agent: AgentSnapshot) => void;
  onSelectTask: (task: AttentionItem) => void;
}

// Das gesamte "KI-Buero" - ein Grid aus Abteilungs-Raeumen. Ersetzt
// ausschliesslich die RENDER-Ebene der bisherigen DepartmentBoard-Kartenliste;
// dieselben, bereits echten Daten (buildAgentSnapshots()/Attention List) wie
// zuvor, keine neue Datenquelle.
export const OfficeFloorScene = memo(function OfficeFloorScene({ departments, agentsByDepartment, tasksByDepartment, onSelectAgent, onSelectTask }: OfficeFloorSceneProps) {
  return (
    <Box
      sx={{
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        p: { xs: 1.5, sm: 2 },
        background: "linear-gradient(180deg, rgba(59,130,246,0.05), transparent 40%)",
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
        <Typography variant="h3">🏢 KI-Büro</Typography>
        <Chip
          size="small"
          label="LIVE"
          sx={{
            height: 20,
            fontWeight: 700,
            fontSize: "0.65rem",
            backgroundColor: "#22c55e1f",
            color: "#22c55e",
            "& .MuiChip-label": { display: "flex", alignItems: "center", gap: 0.5 },
          }}
          icon={
            <Box sx={{ width: 6, height: 6, ml: 1, borderRadius: "50%", backgroundColor: "#22c55e", animation: "office-live-pulse 1.4s ease-in-out infinite", "@keyframes office-live-pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.3 } } }} />
          }
        />
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
        {departments.map((dept) => (
          <OfficeRoom
            key={dept.id}
            department={dept}
            agents={agentsByDepartment.get(dept.id) ?? []}
            tasks={tasksByDepartment.get(dept.id) ?? []}
            onSelectAgent={onSelectAgent}
            onSelectTask={onSelectTask}
          />
        ))}
      </Box>
    </Box>
  );
});
