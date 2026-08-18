import { memo } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import { OfficeCharacter } from "./OfficeCharacter";
import { AGENT_STATUS_LABEL } from "./officeConfig";
import type { AgentSnapshot } from "./officeConfig";

// Feste, deterministische Farbpalette je Projekt (nach Reihenfolge des
// ersten Auftretens in den echten Agenten-Daten vergeben) - keine erfundene
// Bedeutung, nur visuelle Unterscheidbarkeit "das sind Leute von Projekt X".
const PROJECT_COLORS = ["#3b82f6", "#f97316", "#10b981", "#a855f7", "#eab308", "#ec4899", "#14b8a6"];

function colorForProject(projectId: string, order: string[]): string {
  const idx = order.indexOf(projectId);
  return PROJECT_COLORS[idx % PROJECT_COLORS.length] ?? "#3b82f6";
}

function speechFor(agent: AgentSnapshot): string | null {
  if (agent.status === "WORKING") return agent.rule.action.replace(/_/g, " ").toLowerCase();
  if (agent.status === "WAITING") return "wartet auf Freigabe...";
  if (agent.status === "BLOCKED") return agent.latestExecution?.error ? agent.latestExecution.error.slice(0, 46) : "blockiert";
  return null;
}

interface DeskProps {
  agent: AgentSnapshot;
  color: string;
  onSelectAgent: (agent: AgentSnapshot) => void;
}

// Ein Schreibtisch = eine echte Automation Rule (Phase 11). Als kleine,
// aber echte Tischplatte gezeichnet (Flaeche + Kante + Beine), nicht mehr
// als flache Pille. "Kaputt" (BLOCKED) wird bewusst dramatisch dargestellt
// (brennender Schreibtisch), damit ein Problem sofort auffaellt.
const OfficeDesk = memo(function OfficeDesk({ agent, color, onSelectAgent }: DeskProps) {
  const speech = speechFor(agent);
  const isBlocked = agent.status === "BLOCKED";

  return (
    <Box sx={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: 96 }}>
      {speech ? (
        <Box
          sx={{
            position: "absolute",
            bottom: "100%",
            mb: 0.5,
            maxWidth: 150,
            backgroundColor: "#fff",
            color: "#2a2a2a",
            borderRadius: "10px 10px 10px 2px",
            px: 1,
            py: 0.5,
            boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            zIndex: 4,
          }}
        >
          <Box sx={{ fontSize: "0.65rem", fontWeight: 600 }}>{speech}</Box>
        </Box>
      ) : null}

      {isBlocked ? (
        <>
          <Box
            sx={{
              position: "absolute",
              bottom: 34,
              fontSize: 28,
              zIndex: 3,
              animation: "office-fire-flicker 0.6s ease-in-out infinite alternate",
              filter: "drop-shadow(0 0 10px rgba(255,120,20,0.85))",
              "@keyframes office-fire-flicker": {
                from: { transform: "scale(1) translateY(0) rotate(-3deg)", opacity: 0.9 },
                to: { transform: "scale(1.15) translateY(-3px) rotate(3deg)", opacity: 1 },
              },
            }}
          >
            🔥
          </Box>
          <Box
            sx={{
              position: "absolute",
              bottom: 60,
              left: "62%",
              fontSize: 16,
              opacity: 0.5,
              zIndex: 3,
              animation: "office-smoke-rise 2s ease-in infinite",
              "@keyframes office-smoke-rise": {
                "0%": { transform: "translateY(0) scale(0.7)", opacity: 0.5 },
                "100%": { transform: "translateY(-22px) scale(1.3)", opacity: 0 },
              },
            }}
          >
            💨
          </Box>
        </>
      ) : null}

      <OfficeCharacter
        status={agent.status}
        color={color}
        label={agent.rule.name}
        onClick={() => onSelectAgent(agent)}
        tooltip={
          <Box>
            <Box sx={{ fontSize: "0.7rem", fontWeight: 700 }}>{agent.rule.name}</Box>
            <Box sx={{ fontSize: "0.65rem" }}>{agent.rule.projectId}</Box>
            <Box sx={{ fontSize: "0.65rem" }}>{AGENT_STATUS_LABEL[agent.status]}</Box>
          </Box>
        }
      />

      {/* Schreibtisch: Tischplatte + Vorderkante + Beine, wie ein echtes Moebelstueck */}
      <Tooltip title={AGENT_STATUS_LABEL[agent.status]} enterDelay={400}>
        <Box onClick={() => onSelectAgent(agent)} sx={{ position: "relative", mt: -0.5, cursor: "pointer" }}>
          <Box
            sx={{
              width: 76,
              height: 24,
              borderRadius: "5px",
              backgroundColor: isBlocked ? "#c65f3f" : "#c8a36b",
              boxShadow: isBlocked ? "0 4px 12px rgba(220,80,30,0.55)" : "0 4px 8px rgba(0,0,0,0.2)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              pt: 0.5,
            }}
          >
            <Box sx={{ width: 20, height: 14, borderRadius: "2px", backgroundColor: color, opacity: 0.9, boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.35)" }} />
          </Box>
          {/* Vordere Tischkante (dunklerer Farbton = Tiefe) */}
          <Box sx={{ width: 76, height: 6, backgroundColor: isBlocked ? "#a3492f" : "#a8804a", borderRadius: "0 0 4px 4px" }} />
          {/* Tischbeine */}
          <Box sx={{ position: "absolute", bottom: -10, left: 6, width: 4, height: 10, backgroundColor: "#8a6c3f" }} />
          <Box sx={{ position: "absolute", bottom: -10, right: 6, width: 4, height: 10, backgroundColor: "#8a6c3f" }} />
        </Box>
      </Tooltip>
    </Box>
  );
});

interface ZoneProps {
  title: string;
  agents: { agent: AgentSnapshot; color: string }[];
  emptyLabel?: string;
  accentColor: string;
  onSelectAgent: (agent: AgentSnapshot) => void;
}

// Eine Unter-Abteilung ("Apps" / "Webseiten") innerhalb einer Besitz-Zone.
// Leer bleibt ehrlich leer (z.B. "Kundenprojekte" - es gibt aktuell keine
// echten Kundenprojekte in den Daten) statt erfundener Mitarbeiter.
const OfficeZone = memo(function OfficeZone({ title, agents, emptyLabel, accentColor, onSelectAgent }: ZoneProps) {
  return (
    <Box sx={{ flex: 1, minWidth: 260 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1, px: 0.5 }}>
        <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: accentColor }} />
        <Box sx={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.05em", color: "#6b5c47", textTransform: "uppercase" }}>{title}</Box>
      </Box>
      <Box
        sx={{
          minHeight: 150,
          borderRadius: 2,
          backgroundColor: "rgba(255,255,255,0.28)",
          border: "1px dashed rgba(139,115,85,0.25)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: agents.length === 0 ? "center" : "flex-start",
          gap: 2,
          p: 2,
        }}
      >
        {agents.length === 0 ? (
          <Box sx={{ color: "#a3937a", fontSize: "0.75rem", fontStyle: "italic", alignSelf: "center" }}>{emptyLabel ?? "Noch niemand hier"}</Box>
        ) : (
          agents.map(({ agent, color }) => <OfficeDesk key={agent.rule.id} agent={agent} color={color} onSelectAgent={onSelectAgent} />)
        )}
      </Box>
    </Box>
  );
});

// Kaffee-/Kuechenecke - rein dekorativ (kein echter Agent haengt hier dran),
// gehoert aber sichtbar zum Buero dazu, genau wie in echten Buerofotos.
const OfficeKitchen = memo(function OfficeKitchen() {
  return (
    <Box sx={{ position: "relative", width: 200, mx: "auto", mt: 1 }}>
      <Box sx={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.05em", color: "#6b5c47", textTransform: "uppercase", textAlign: "center", mb: 1 }}>
        ☕ Küche
      </Box>
      <Box sx={{ position: "relative", height: 90, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.28)", border: "1px dashed rgba(139,115,85,0.25)", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3, pb: 1.5 }}>
        {/* Kaffeemaschine */}
        <Box sx={{ position: "relative" }}>
          <Box sx={{ width: 22, height: 30, borderRadius: "3px 3px 1px 1px", backgroundColor: "#4a4a52" }} />
          <Box sx={{ position: "absolute", top: 4, left: 5, width: 12, height: 6, borderRadius: 1, backgroundColor: "#e8503a" }} />
          <Box
            sx={{
              position: "absolute",
              top: -10,
              left: 8,
              fontSize: 12,
              opacity: 0.6,
              animation: "office-steam 2.4s ease-in infinite",
              "@keyframes office-steam": { "0%": { transform: "translateY(0)", opacity: 0.6 }, "100%": { transform: "translateY(-14px)", opacity: 0 } },
            }}
          >
            〰️
          </Box>
        </Box>
        {/* Tisch mit Tassen */}
        <Box sx={{ width: 54, height: 8, borderRadius: 1, backgroundColor: "#c8a36b", position: "relative" }}>
          <Box sx={{ position: "absolute", bottom: -12, left: 4, width: 3, height: 12, backgroundColor: "#8a6c3f" }} />
          <Box sx={{ position: "absolute", bottom: -12, right: 4, width: 3, height: 12, backgroundColor: "#8a6c3f" }} />
          <Box sx={{ position: "absolute", top: -10, left: 8, fontSize: 14 }}>☕</Box>
          <Box sx={{ position: "absolute", top: -10, right: 8, fontSize: 14 }}>🍪</Box>
        </Box>
      </Box>
    </Box>
  );
});

export interface OfficeAgentWithProjectType extends AgentSnapshot {
  projectType: "website" | "app";
}

interface OfficeFloorSceneProps {
  agents: OfficeAgentWithProjectType[];
  onSelectAgent: (agent: AgentSnapshot) => void;
}

// Das gesamte Buero - EIN durchgehender Raum (kein Karten-/Dashboard-Look),
// gegliedert nach echter Projekt-Zugehoerigkeit: "Meine Projekte" (alle 4
// echten Projekte - es gibt aktuell keine als Kunde markierten Projekte in
// den Daten, siehe Chat) und "Kundenprojekte" (bewusst leer statt erfunden),
// je unterteilt nach echtem project.type (Apps / Webseiten). Reines SVG/CSS,
// keine neue Library, keine Kennzahlen-Kacheln - auf Nutzerwunsch nur die
// reine Visualisierung.
export const OfficeFloorScene = memo(function OfficeFloorScene({ agents, onSelectAgent }: OfficeFloorSceneProps) {
  const projectOrder: string[] = [];
  for (const a of agents) if (!projectOrder.includes(a.rule.projectId)) projectOrder.push(a.rule.projectId);

  const withColor = agents.map((agent) => ({ agent, color: colorForProject(agent.rule.projectId, projectOrder) }));
  const ownApps = withColor.filter((x) => x.agent.projectType === "app");
  const ownWebsites = withColor.filter((x) => x.agent.projectType === "website");

  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: 3,
        overflow: "hidden",
        minHeight: "calc(100vh - 140px)",
        background: "linear-gradient(180deg, #f2e9db 0%, #f2e9db 20%, #e9dcc4 20%, #e4d5ba 100%)",
        border: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      {/* Fenster mit driftenden Wolken */}
      {[52, "calc(100% - 172px)"].map((left, i) => (
        <Box key={i} sx={{ position: "absolute", top: 16, left, width: 120, height: 84, borderRadius: 1, border: "5px solid #fff", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", overflow: "hidden", background: "linear-gradient(180deg,#bfe0f5,#e8f4fb)" }}>
          <Box sx={{ position: "absolute", inset: 0, "&::before, &::after": { content: '""', position: "absolute", backgroundColor: "#fff", zIndex: 1 }, "&::before": { top: 0, bottom: 0, left: "50%", width: 4, transform: "translateX(-50%)" }, "&::after": { left: 0, right: 0, top: "50%", height: 4, transform: "translateY(-50%)" } }} />
          <Box sx={{ position: "absolute", top: 14, left: -40, width: 26, height: 10, borderRadius: 5, backgroundColor: "#fff", opacity: 0.85, animation: `office-cloud-drift 14s linear infinite`, animationDelay: `${i * 4}s`, "@keyframes office-cloud-drift": { from: { transform: "translateX(0)" }, to: { transform: "translateX(220px)" } } }} />
          <Box sx={{ position: "absolute", top: 40, left: -70, width: 20, height: 8, borderRadius: 4, backgroundColor: "#fff", opacity: 0.7, animation: `office-cloud-drift 20s linear infinite`, animationDelay: `${i * 6}s` }} />
        </Box>
      ))}

      {/* Haengelampe mit sanftem Glimmen */}
      <Box sx={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 2, height: 30, backgroundColor: "#c9b896" }} />
      <Box sx={{ position: "absolute", top: 28, left: "50%", transform: "translateX(-50%)", width: 42, height: 20, borderRadius: "50% 50% 0 0", backgroundColor: "#f0e4c8", border: "1px solid #c9b896", boxShadow: "0 0 24px 6px rgba(255,224,150,0.35)", animation: "office-lamp-glow 3s ease-in-out infinite", "@keyframes office-lamp-glow": { "0%,100%": { boxShadow: "0 0 24px 6px rgba(255,224,150,0.25)" }, "50%": { boxShadow: "0 0 30px 10px rgba(255,224,150,0.5)" } } }} />

      {/* Regal (Deko) */}
      <Box sx={{ position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)", ml: -30, mt: 0, display: { xs: "none", md: "block" } }}>
        <Box sx={{ width: 70, height: 46, border: "3px solid #a8804a", borderRadius: 1, position: "relative", backgroundColor: "rgba(200,163,107,0.15)" }}>
          <Box sx={{ position: "absolute", top: "50%", left: 0, right: 0, height: 3, backgroundColor: "#a8804a" }} />
          <Box sx={{ position: "absolute", top: 4, left: 6, width: 6, height: 16, backgroundColor: "#e8927a" }} />
          <Box sx={{ position: "absolute", top: 4, left: 14, width: 6, height: 14, backgroundColor: "#7fb3d5" }} />
          <Box sx={{ position: "absolute", top: 6, left: 22, width: 6, height: 12, backgroundColor: "#8fbf7f" }} />
          <Box sx={{ position: "absolute", bottom: 4, left: 8, width: 10, height: 8, borderRadius: "1px", backgroundColor: "#d9c48f" }} />
        </Box>
      </Box>

      {/* Topfpflanzen */}
      <Box sx={{ position: "absolute", bottom: 20, left: 20 }}>
        <Box sx={{ width: 30, height: 26, borderRadius: "50% 50% 30% 30% / 60% 60% 20% 20%", backgroundColor: "#5a8a5f" }} />
        <Box sx={{ width: 22, height: 18, mx: "auto", borderRadius: "2px 2px 6px 6px", backgroundColor: "#b5713f" }} />
      </Box>
      <Box sx={{ position: "absolute", bottom: 20, right: 20 }}>
        <Box sx={{ width: 24, height: 20, borderRadius: "50% 50% 30% 30% / 60% 60% 20% 20%", backgroundColor: "#4f7a54" }} />
        <Box sx={{ width: 18, height: 14, mx: "auto", borderRadius: "2px 2px 6px 6px", backgroundColor: "#a56438" }} />
      </Box>

      {/* LIVE-Badge */}
      <Box sx={{ position: "absolute", top: 14, left: 14, display: "flex", alignItems: "center", gap: 0.7, backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 5, px: 1.2, py: 0.4, boxShadow: "0 1px 4px rgba(0,0,0,0.1)", zIndex: 2 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#e53935", animation: "office-live-pulse 1.3s ease-in-out infinite", "@keyframes office-live-pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.3 } } }} />
        <Box sx={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.06em", color: "#444" }}>LIVE</Box>
      </Box>

      {/* Boden mit Abteilungen */}
      <Box sx={{ position: "relative", mt: "160px", pb: 4, px: { xs: 2, sm: 4 } }}>
        {/* Meine Projekte */}
        <Box sx={{ mb: 1 }}>
          <Box sx={{ fontSize: "0.85rem", fontWeight: 800, color: "#4a3d2a", mb: 1.5, pl: 0.5 }}>🏠 Meine Projekte</Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            <OfficeZone title="Apps" agents={ownApps} accentColor="#3b82f6" onSelectAgent={onSelectAgent} emptyLabel="Keine aktiven Automation Rules für App-Projekte" />
            <OfficeZone title="Webseiten" agents={ownWebsites} accentColor="#14b8a6" onSelectAgent={onSelectAgent} emptyLabel="Keine aktiven Automation Rules für Webseiten-Projekte" />
          </Box>
        </Box>

        {/* Kundenprojekte - ehrlich leer, keine erfundenen Kunden */}
        <Box sx={{ mt: 3 }}>
          <Box sx={{ fontSize: "0.85rem", fontWeight: 800, color: "#4a3d2a", mb: 1.5, pl: 0.5 }}>💼 Kundenprojekte</Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            <OfficeZone title="Apps" agents={[]} accentColor="#9ca3af" onSelectAgent={onSelectAgent} emptyLabel="Noch keine Kundenprojekte hinterlegt" />
            <OfficeZone title="Webseiten" agents={[]} accentColor="#9ca3af" onSelectAgent={onSelectAgent} emptyLabel="Noch keine Kundenprojekte hinterlegt" />
          </Box>
        </Box>

        <OfficeKitchen />
      </Box>
    </Box>
  );
});
