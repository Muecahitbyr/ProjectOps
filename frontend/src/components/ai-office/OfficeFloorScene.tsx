import { memo } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import { OfficeCharacter } from "./OfficeCharacter";
import { AGENT_STATUS_LABEL } from "./officeConfig";
import type { DepartmentConfig, AgentSnapshot } from "./officeConfig";

interface DeskProps {
  agent: AgentSnapshot;
  department: DepartmentConfig;
  onSelectAgent: (agent: AgentSnapshot) => void;
}

// Echter, kurzer Sprechblasen-Text ausschliesslich aus bereits geladenen
// Feldern des Agenten (Regelname/Aktion/letzte Ausfuehrung) - keine erfundene
// Konversation.
function speechFor(agent: AgentSnapshot): string | null {
  if (agent.status === "WORKING") return agent.rule.action.replace(/_/g, " ").toLowerCase();
  if (agent.status === "WAITING") return "wartet auf Freigabe...";
  if (agent.status === "BLOCKED") return agent.latestExecution?.error ? agent.latestExecution.error.slice(0, 46) : "blockiert";
  return null;
}

// Ein Schreibtisch = eine echte Automation Rule (Phase 11). "Kaputt"
// (BLOCKED - Regel abgelehnt oder Ausfuehrung fehlgeschlagen) wird bewusst
// dramatisch/eindeutig dargestellt (brennender Schreibtisch), damit ein
// Problem sofort ins Auge faellt statt in einer Statuszahl zu verschwinden -
// exakt der vom Nutzer gewuenschte Effekt. Keine erfundene Ursache: der
// Klick oeffnet weiterhin den echten Fehlertext (OfficeDetailDrawer).
const OfficeDesk = memo(function OfficeDesk({ agent, department, onSelectAgent }: DeskProps) {
  const speech = speechFor(agent);
  const isBlocked = agent.status === "BLOCKED";

  return (
    <Box sx={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: 84 }}>
      {speech ? (
        <Box
          sx={{
            position: "absolute",
            bottom: "100%",
            mb: 0.5,
            maxWidth: 140,
            backgroundColor: "#fff",
            color: "#2a2a2a",
            borderRadius: "10px 10px 10px 2px",
            px: 1,
            py: 0.5,
            boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            zIndex: 3,
          }}
        >
          <Box sx={{ fontSize: "0.65rem", fontWeight: 600 }}>{speech}</Box>
        </Box>
      ) : null}

      {/* Feuer-/Rauch-Overlay bei echtem Fehler - das eigentliche "etwas laeuft nicht"-Signal */}
      {isBlocked ? (
        <Box
          sx={{
            position: "absolute",
            bottom: 30,
            fontSize: 26,
            animation: "office-fire-flicker 0.6s ease-in-out infinite alternate",
            filter: "drop-shadow(0 0 8px rgba(255,120,20,0.8))",
            zIndex: 2,
            "@keyframes office-fire-flicker": {
              from: { transform: "scale(1) translateY(0)", opacity: 0.9 },
              to: { transform: "scale(1.12) translateY(-2px)", opacity: 1 },
            },
          }}
        >
          🔥
        </Box>
      ) : null}

      <OfficeCharacter
        status={agent.status}
        color={department.accentColor}
        label={agent.rule.name}
        onClick={() => onSelectAgent(agent)}
        tooltip={
          <Box>
            <Box sx={{ fontSize: "0.7rem", fontWeight: 700 }}>{agent.rule.name}</Box>
            <Box sx={{ fontSize: "0.65rem" }}>{department.name}</Box>
            <Box sx={{ fontSize: "0.65rem" }}>{AGENT_STATUS_LABEL[agent.status]}</Box>
          </Box>
        }
      />

      {/* Schreibtisch - liegt am Fuss der Figur, leicht ueberlappend mit dem
          Bodenschatten, wie eine von schraeg oben gesehene Tischplatte. */}
      <Tooltip title={AGENT_STATUS_LABEL[agent.status]} enterDelay={400}>
        <Box
          onClick={() => onSelectAgent(agent)}
          sx={{
            position: "relative",
            mt: -0.5,
            width: 62,
            height: 18,
            borderRadius: "6px",
            backgroundColor: isBlocked ? "#e8927a" : "#fdfbf7",
            boxShadow: isBlocked ? "0 3px 10px rgba(220,80,30,0.5)" : "0 3px 6px rgba(0,0,0,0.18)",
            border: "1px solid",
            borderColor: isBlocked ? "#c65f3f" : "rgba(0,0,0,0.08)",
            cursor: "pointer",
            transition: "box-shadow 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Mini-Monitor auf dem Schreibtisch - rein dekorativ */}
          <Box sx={{ width: 16, height: 10, borderRadius: "2px", backgroundColor: department.accentColor, opacity: 0.85 }} />
        </Box>
      </Tooltip>

      <Box sx={{ mt: 0.75, fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.04em", color: "#8a7b68", textTransform: "uppercase", textAlign: "center" }}>
        {department.name}
      </Box>
    </Box>
  );
});

interface OfficeFloorSceneProps {
  departments: DepartmentConfig[];
  agentsByDepartment: Map<string, AgentSnapshot[]>;
  onSelectAgent: (agent: AgentSnapshot) => void;
}

// Ein einziges, durchgehendes Buero (kein Karten-/Dashboard-Look) - reines
// SVG/CSS, kein Bild-Asset, keine neue Library. Zeigt AUSSCHLIESSLICH echte
// Automation-Rule-Agenten als Personen an Schreibtischen - keine Kennzahlen-
// Kacheln, keine Listen. departments/tasksByDepartment bleiben Props fuer den
// Klick-Handler-Vertrag zur bestehenden Attention-List, werden hier aber
// nicht mehr separat als Text dargestellt (auf Nutzerwunsch: "nur
// visualisiert").
export const OfficeFloorScene = memo(function OfficeFloorScene({ departments, agentsByDepartment, onSelectAgent }: OfficeFloorSceneProps) {
  const allAgents = departments.flatMap((dept) => (agentsByDepartment.get(dept.id) ?? []).map((agent) => ({ agent, dept })));

  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: 3,
        overflow: "hidden",
        minHeight: "calc(100vh - 140px)",
        background: "linear-gradient(180deg, #f2e9db 0%, #f2e9db 34%, #e9dcc4 34%, #e4d5ba 100%)",
        border: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      {/* Fenster */}
      <Box sx={{ position: "absolute", top: 22, left: 40, width: 130, height: 100, borderRadius: 1, border: "6px solid #fff", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", background: "linear-gradient(180deg,#bfe0f5,#e8f4fb)", "&::before, &::after": { content: '""', position: "absolute", backgroundColor: "#fff" }, "&::before": { top: 0, bottom: 0, left: "50%", width: 4, transform: "translateX(-50%)" }, "&::after": { left: 0, right: 0, top: "50%", height: 4, transform: "translateY(-50%)" } }} />
      <Box sx={{ position: "absolute", top: 22, right: 40, width: 130, height: 100, borderRadius: 1, border: "6px solid #fff", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", background: "linear-gradient(180deg,#bfe0f5,#e8f4fb)", "&::before, &::after": { content: '""', position: "absolute", backgroundColor: "#fff" }, "&::before": { top: 0, bottom: 0, left: "50%", width: 4, transform: "translateX(-50%)" }, "&::after": { left: 0, right: 0, top: "50%", height: 4, transform: "translateY(-50%)" } }} />

      {/* Haengelampe */}
      <Box sx={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 2, height: 34, backgroundColor: "#c9b896" }} />
      <Box sx={{ position: "absolute", top: 32, left: "50%", transform: "translateX(-50%)", width: 46, height: 22, borderRadius: "50% 50% 0 0", backgroundColor: "#e8ddc8", border: "1px solid #c9b896" }} />

      {/* Topfpflanze */}
      <Box sx={{ position: "absolute", bottom: 24, left: 24 }}>
        <Box sx={{ width: 30, height: 26, borderRadius: "50% 50% 30% 30% / 60% 60% 20% 20%", backgroundColor: "#5a8a5f" }} />
        <Box sx={{ width: 22, height: 18, mx: "auto", borderRadius: "2px 2px 6px 6px", backgroundColor: "#b5713f" }} />
      </Box>

      {/* LIVE-Badge */}
      <Box sx={{ position: "absolute", top: 14, left: 14, display: "flex", alignItems: "center", gap: 0.7, backgroundColor: "rgba(255,255,255,0.75)", borderRadius: 5, px: 1.2, py: 0.4, boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>
        <Box sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#e53935", animation: "office-live-pulse 1.3s ease-in-out infinite", "@keyframes office-live-pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.3 } } }} />
        <Box sx={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.06em", color: "#444" }}>LIVE</Box>
      </Box>

      {/* Der Boden mit den Schreibtischen */}
      <Box
        sx={{
          position: "relative",
          mt: "34%",
          minHeight: 340,
          pb: 6,
          pt: 5,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignContent: "flex-start",
          gap: { xs: 3, sm: 5 },
          px: 4,
        }}
      >
        {allAgents.length === 0 ? (
          <Box sx={{ color: "#8a7b68", fontSize: "0.85rem", mt: 4 }}>Noch keine Automation Rules angelegt - das Büro füllt sich, sobald echte Agenten existieren.</Box>
        ) : (
          allAgents.map(({ agent, dept }) => <OfficeDesk key={agent.rule.id} agent={agent} department={dept} onSelectAgent={onSelectAgent} />)
        )}
      </Box>
    </Box>
  );
});
