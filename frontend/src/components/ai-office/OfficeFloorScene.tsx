import { memo, useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import { OfficeCharacter } from "./OfficeCharacter";
import { AGENT_STATUS_LABEL } from "./officeConfig";
import type { AgentSnapshot } from "./officeConfig";

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
  away: boolean;
  onSelectAgent: (agent: AgentSnapshot) => void;
  deskRef: (el: HTMLDivElement | null) => void;
}

// Ein Schreibtisch = eine echte Automation Rule (Phase 11): Tischplatte +
// Vorderkante + Beine + MacBook. "Kaputt" (BLOCKED) wird bewusst dramatisch
// dargestellt (brennender Schreibtisch + Rauch). "away" = die Person ist
// gerade (Animation) in der Kueche - der Schreibtisch bleibt sichtbar, aber
// leer (Stuhl statt Person), keine erfundene Anwesenheit.
const OfficeDesk = memo(function OfficeDesk({ agent, color, away, onSelectAgent, deskRef }: DeskProps) {
  const speech = speechFor(agent);
  const isBlocked = agent.status === "BLOCKED";

  return (
    <Box ref={deskRef} sx={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: 96 }}>
      {speech && !away ? (
        <Box sx={{ position: "absolute", bottom: "100%", mb: 0.5, maxWidth: 150, backgroundColor: "#fff", color: "#2a2a2a", borderRadius: "10px 10px 10px 2px", px: 1, py: 0.5, boxShadow: "0 2px 6px rgba(0,0,0,0.18)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", zIndex: 4 }}>
          <Box sx={{ fontSize: "0.65rem", fontWeight: 600 }}>{speech}</Box>
        </Box>
      ) : null}

      {isBlocked && !away ? (
        <>
          <Box sx={{ position: "absolute", bottom: 34, fontSize: 28, zIndex: 3, animation: "office-fire-flicker 0.6s ease-in-out infinite alternate", filter: "drop-shadow(0 0 10px rgba(255,120,20,0.85))", "@keyframes office-fire-flicker": { from: { transform: "scale(1) translateY(0) rotate(-3deg)", opacity: 0.9 }, to: { transform: "scale(1.15) translateY(-3px) rotate(3deg)", opacity: 1 } } }}>
            🔥
          </Box>
          <Box sx={{ position: "absolute", bottom: 60, left: "62%", fontSize: 16, opacity: 0.5, zIndex: 3, animation: "office-smoke-rise 2s ease-in infinite", "@keyframes office-smoke-rise": { "0%": { transform: "translateY(0) scale(0.7)", opacity: 0.5 }, "100%": { transform: "translateY(-22px) scale(1.3)", opacity: 0 } } }}>
            💨
          </Box>
        </>
      ) : null}

      {away ? (
        <Box sx={{ width: 60, height: 64, display: "flex", alignItems: "flex-end", justifyContent: "center", opacity: 0.55 }}>
          {/* Leerer Stuhl - die Person ist gerade in der Kueche */}
          <Box sx={{ width: 22, height: 24, borderRadius: "3px 3px 0 0", border: "3px solid #8a6c3f", borderBottom: "none" }} />
        </Box>
      ) : (
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
      )}

      {/* Schreibtisch: Tischplatte + Vorderkante + Beine + MacBook */}
      <Tooltip title={AGENT_STATUS_LABEL[agent.status]} enterDelay={400}>
        <Box onClick={() => onSelectAgent(agent)} sx={{ position: "relative", mt: -0.5, cursor: "pointer" }}>
          <Box sx={{ width: 76, height: 24, borderRadius: "5px", backgroundColor: isBlocked && !away ? "#c65f3f" : "#c8a36b", boxShadow: isBlocked && !away ? "0 4px 12px rgba(220,80,30,0.55)" : "0 4px 8px rgba(0,0,0,0.2)", display: "flex", alignItems: "flex-end", justifyContent: "center", pb: 0.5 }}>
            {/* MacBook: Basis (Tastaturteil) + aufgeklappter Bildschirm */}
            <Box sx={{ position: "relative", width: 26, height: 4, borderRadius: "1px", backgroundColor: "#c7c9cc" }}>
              <Box sx={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", width: 22, height: 15, borderRadius: "1px 1px 0 0", backgroundColor: "#2b2d31", border: "1px solid #47494e" }}>
                <Box sx={{ position: "absolute", inset: 1.5, backgroundColor: color, opacity: 0.55, borderRadius: "1px" }} />
              </Box>
            </Box>
          </Box>
          <Box sx={{ width: 76, height: 6, backgroundColor: isBlocked && !away ? "#a3492f" : "#a8804a", borderRadius: "0 0 4px 4px" }} />
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
  awayAgentId: string | null;
  onSelectAgent: (agent: AgentSnapshot) => void;
  registerDeskRef: (agentId: string, el: HTMLDivElement | null) => void;
}

const OfficeZone = memo(function OfficeZone({ title, agents, emptyLabel, accentColor, awayAgentId, onSelectAgent, registerDeskRef }: ZoneProps) {
  return (
    <Box sx={{ flex: 1, minWidth: 260 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1, px: 0.5 }}>
        <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: accentColor }} />
        <Box sx={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.05em", color: "#6b5c47", textTransform: "uppercase" }}>{title}</Box>
      </Box>
      <Box sx={{ minHeight: 150, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.28)", border: "1px dashed rgba(139,115,85,0.25)", display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: agents.length === 0 ? "center" : "flex-start", gap: 2, p: 2 }}>
        {agents.length === 0 ? (
          <Box sx={{ color: "#a3937a", fontSize: "0.75rem", fontStyle: "italic", alignSelf: "center" }}>{emptyLabel ?? "Noch niemand hier"}</Box>
        ) : (
          agents.map(({ agent, color }) => (
            <OfficeDesk key={agent.rule.id} agent={agent} color={color} away={awayAgentId === agent.rule.id} onSelectAgent={onSelectAgent} deskRef={(el) => registerDeskRef(agent.rule.id, el)} />
          ))
        )}
      </Box>
    </Box>
  );
});

// Deutlich groessere Kuechenzeile: echter Kuehlschrank mit oeffnender Tuer,
// eine als Espressomaschine erkennbare Kaffeemaschine (Gruppenkopf + Tasse +
// Dampf, keine Server-Schrank-Optik mehr), Kaffeetisch mit 2 Stuehlen. Rein
// dekorativ (kein echter Agent haengt hier fix dran), zwei der drei Ziele
// der echten Pausen-Laufanimation (siehe coffeeRef/fridgeRef in
// OfficeFloorScene) - die Tuer oeffnet sich tatsaechlich, wenn jemand am
// Kuehlschrank ankommt.
const OfficeKitchen = memo(function OfficeKitchen({
  coffeeRef,
  fridgeRef,
  fridgeOpen,
}: {
  coffeeRef: (el: HTMLDivElement | null) => void;
  fridgeRef: (el: HTMLDivElement | null) => void;
  fridgeOpen: boolean;
}) {
  return (
    <Box sx={{ position: "relative", width: 380, maxWidth: "100%" }}>
      <Box sx={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.05em", color: "#6b5c47", textTransform: "uppercase", textAlign: "center", mb: 1 }}>
        ☕ Küche
      </Box>
      <Box sx={{ position: "relative", height: 160, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.32)", border: "1px dashed rgba(139,115,85,0.25)", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4, pb: 2 }}>
        {/* Kuehlschrank mit echter Tuer-Oeffnen-Animation */}
        <Box ref={fridgeRef} sx={{ position: "relative", width: 40, height: 64, borderRadius: "4px", backgroundColor: "#2a2d33", perspective: "160px" }}>
          {/* Inneres (wird beim Oeffnen sichtbar) */}
          <Box sx={{ position: "absolute", inset: 3, borderRadius: "2px", backgroundColor: "#e8f2f5", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 0.5, p: 0.5 }}>
            <Box sx={{ width: "70%", height: 6, borderRadius: "1px", backgroundColor: "#e85a4f" }} />
            <Box sx={{ width: "55%", height: 6, borderRadius: "1px", backgroundColor: "#4fa3e8" }} />
            <Box sx={{ width: "60%", height: 8, borderRadius: "1px", backgroundColor: "#7fbf6f" }} />
          </Box>
          {/* Tuer */}
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: "4px",
              backgroundColor: "#dfe3e6",
              border: "2px solid #b8bec4",
              transformOrigin: "left center",
              transition: "transform 0.6s ease",
              transform: fridgeOpen ? "rotateY(-108deg)" : "rotateY(0deg)",
            }}
          >
            <Box sx={{ position: "absolute", top: 18, left: 0, right: 0, height: 2, backgroundColor: "#b8bec4" }} />
            <Box sx={{ position: "absolute", top: 5, right: 3, width: 3, height: 10, borderRadius: 2, backgroundColor: "#9aa1a8" }} />
            <Box sx={{ position: "absolute", top: 25, right: 3, width: 3, height: 18, borderRadius: 2, backgroundColor: "#9aa1a8" }} />
          </Box>
        </Box>

        {/* Espressomaschine - Gruppenkopf, Tasse, Dampf statt Server-Optik */}
        <Box ref={coffeeRef} sx={{ position: "relative" }}>
          {/* Arbeitsplatte */}
          <Box sx={{ width: 70, height: 8, backgroundColor: "#c8a36b", borderRadius: "2px", mb: "-1px" }} />
          {/* Maschinenkoerper */}
          <Box sx={{ position: "relative", mx: "auto", width: 46, height: 30, borderRadius: "6px 6px 3px 3px", background: "linear-gradient(180deg,#3a3d44,#26282d)", boxShadow: "0 2px 4px rgba(0,0,0,0.3)" }}>
            {/* Chrom-Zierstreifen */}
            <Box sx={{ position: "absolute", top: 3, left: 4, right: 4, height: 3, borderRadius: 2, backgroundColor: "#c9ccd1" }} />
            {/* Bedienknoepfe */}
            <Box sx={{ position: "absolute", top: 9, left: 6, width: 4, height: 4, borderRadius: "50%", backgroundColor: "#e85a4f" }} />
            <Box sx={{ position: "absolute", top: 9, left: 13, width: 4, height: 4, borderRadius: "50%", backgroundColor: "#7fbf6f" }} />
            {/* Gruppenkopf (Bruehgruppe) */}
            <Box sx={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", width: 14, height: 8, backgroundColor: "#1c1e22", borderRadius: "1px" }} />
          </Box>
          {/* Tasse unter dem Gruppenkopf */}
          <Box sx={{ position: "relative", mx: "auto", mt: "8px", width: 12, height: 10, borderRadius: "0 0 4px 4px", backgroundColor: "#fff", border: "1.5px solid #d8d0c0" }}>
            <Box
              sx={{
                position: "absolute",
                top: -14,
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 12,
                opacity: 0.7,
                animation: "office-steam 2.2s ease-in infinite",
                "@keyframes office-steam": { "0%": { transform: "translate(-50%,0)", opacity: 0.7 }, "100%": { transform: "translate(-50%,-16px)", opacity: 0 } },
              }}
            >
              〰️
            </Box>
          </Box>
        </Box>

        {/* Kaffeetisch mit 2 Stuehlen und Tassen */}
        <Box sx={{ position: "relative" }}>
          <Box sx={{ width: 64, height: 8, borderRadius: 1, backgroundColor: "#c8a36b", position: "relative" }}>
            <Box sx={{ position: "absolute", bottom: -14, left: 4, width: 3, height: 14, backgroundColor: "#8a6c3f" }} />
            <Box sx={{ position: "absolute", bottom: -14, right: 4, width: 3, height: 14, backgroundColor: "#8a6c3f" }} />
            <Box sx={{ position: "absolute", top: -11, left: 6, fontSize: 15 }}>☕</Box>
            <Box sx={{ position: "absolute", top: -11, left: 26, fontSize: 15 }}>🍪</Box>
            <Box sx={{ position: "absolute", top: -11, right: 6, fontSize: 15 }}>☕</Box>
          </Box>
          <Box sx={{ position: "absolute", bottom: -6, left: -16, width: 12, height: 16, border: "2.5px solid #a8804a", borderBottom: "none", borderRadius: "2px 2px 0 0" }} />
          <Box sx={{ position: "absolute", bottom: -6, right: -16, width: 12, height: 16, border: "2.5px solid #a8804a", borderBottom: "none", borderRadius: "2px 2px 0 0" }} />
        </Box>
      </Box>
    </Box>
  );
});

// Chill Area: Couch + Shisha + kleiner Beistelltisch - drittes moegliches
// Ziel der Pausen-Laufanimation. Egal was dort "gemacht" wird, es ist rein
// dekorativ (kein echter Datenanspruch), aber ein reales, gemessenes
// Laufziel wie Kueche/Kuehlschrank.
const OfficeChillArea = memo(function OfficeChillArea({ chillRef }: { chillRef: (el: HTMLDivElement | null) => void }) {
  return (
    <Box sx={{ position: "relative", width: 300, maxWidth: "100%" }}>
      <Box sx={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.05em", color: "#6b5c47", textTransform: "uppercase", textAlign: "center", mb: 1 }}>
        🛋️ Chill Area
      </Box>
      <Box ref={chillRef} sx={{ position: "relative", height: 160, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.32)", border: "1px dashed rgba(139,115,85,0.25)", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3, pb: 2 }}>
        {/* Couch */}
        <Box sx={{ position: "relative", width: 100, height: 34 }}>
          <Box sx={{ position: "absolute", bottom: 0, width: "100%", height: 22, borderRadius: "8px", backgroundColor: "#7a8fa6" }} />
          <Box sx={{ position: "absolute", bottom: 14, width: "100%", height: 18, borderRadius: "8px 8px 4px 4px", backgroundColor: "#8fa3b8" }} />
          {[6, 34, 62].map((left) => (
            <Box key={left} sx={{ position: "absolute", bottom: 16, left, width: 24, height: 14, borderRadius: "5px", backgroundColor: "#a6b8c9" }} />
          ))}
          <Box sx={{ position: "absolute", bottom: -6, left: 4, width: 5, height: 8, backgroundColor: "#5c6b7a", borderRadius: 1 }} />
          <Box sx={{ position: "absolute", bottom: -6, right: 4, width: 5, height: 8, backgroundColor: "#5c6b7a", borderRadius: 1 }} />
        </Box>

        {/* Shisha auf kleinem Tisch */}
        <Box sx={{ position: "relative", width: 40 }}>
          <Box sx={{ width: 40, height: 6, borderRadius: 1, backgroundColor: "#c8a36b" }} />
          <Box sx={{ position: "absolute", bottom: -10, left: 4, width: 3, height: 10, backgroundColor: "#8a6c3f" }} />
          <Box sx={{ position: "absolute", bottom: -10, right: 4, width: 3, height: 10, backgroundColor: "#8a6c3f" }} />
          {/* Shisha-Silhouette: Vase + Rohr + Kopf */}
          <Box sx={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", width: 14, height: 18, borderRadius: "40% 40% 60% 60% / 50% 50% 70% 70%", background: "linear-gradient(180deg,#c9a86a,#7fbf9f)", opacity: 0.9 }} />
          <Box sx={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", width: 3, height: 8, backgroundColor: "#8a8a8a" }} />
          <Box sx={{ position: "absolute", bottom: 29, left: "50%", transform: "translateX(-50%)", width: 8, height: 5, borderRadius: 1, backgroundColor: "#3a3a3a" }} />
          <Box
            sx={{
              position: "absolute",
              bottom: 34,
              left: "60%",
              width: 3,
              height: 3,
              borderRadius: "50%",
              backgroundColor: "rgba(230,230,230,0.6)",
              animation: "office-shisha-smoke 2.6s ease-in infinite",
              "@keyframes office-shisha-smoke": { "0%": { transform: "translate(0,0) scale(1)", opacity: 0.6 }, "100%": { transform: "translate(10px,-20px) scale(2.4)", opacity: 0 } },
            }}
          />
        </Box>
      </Box>
    </Box>
  );
});

// Eine echte, laufende Person zwischen ihrem echten Schreibtisch und einem
// von drei Pausenzielen (Kaffee/Kuehlschrank/Chill Area) - Position wird per
// getBoundingClientRect() der tatsaechlichen DOM-Elemente gemessen (kein
// geratener/fixer Pfad), animiert per CSS-transition. Nur real IDLE Agenten
// (echter Zustand: seit je nie ausgeloest) werden ausgewaehlt - keine
// erfundene Aktivitaet fuer WORKING/BLOCKED/WAITING-Agenten, deren echter
// Status damit nicht verfaelscht wird.
type WalkDestination = "coffee" | "fridge" | "chill";
const DESTINATION_ITEM: Record<WalkDestination, string> = { coffee: "☕", fridge: "🥤", chill: "😌" };

interface WalkerState {
  agentId: string;
  color: string;
  destination: WalkDestination;
  from: { x: number; y: number };
  to: { x: number; y: number };
  atDestination: boolean;
}

// Diverse, unterschiedlich geformte Pflanzen statt eines einzigen,
// kaktusartigen Topfs - je Position eine andere Silhouette.
function PlantTall() {
  return (
    <Box sx={{ position: "relative", width: 34, height: 70 }}>
      <Box sx={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", width: 3, height: 30, backgroundColor: "#6b8a4f" }} />
      {[[-10, 6, -18], [8, -2, 14], [-4, -14, -4]].map(([dx, dy, rot], i) => (
        <Box key={i} sx={{ position: "absolute", bottom: 40 + (dy ?? 0), left: `calc(50% + ${dx}px)`, width: 22, height: 14, borderRadius: "50% 50% 50% 0", backgroundColor: i % 2 === 0 ? "#5a8a5f" : "#6ea05f", transform: `rotate(${rot}deg)` }} />
      ))}
      <Box sx={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 26, height: 20, borderRadius: "2px 2px 8px 8px", backgroundColor: "#b5713f" }} />
    </Box>
  );
}
function PlantBushy() {
  return (
    <Box sx={{ position: "relative", width: 30, height: 40 }}>
      <Box sx={{ width: 30, height: 26, borderRadius: "50% 50% 40% 40% / 65% 65% 25% 25%", backgroundColor: "#4f7a54" }} />
      <Box sx={{ position: "absolute", top: 6, left: -2, width: 16, height: 16, borderRadius: "50%", backgroundColor: "#5c8f5f" }} />
      <Box sx={{ position: "absolute", top: 4, right: -2, width: 14, height: 14, borderRadius: "50%", backgroundColor: "#6ea05f" }} />
      <Box sx={{ width: 22, height: 16, mx: "auto", borderRadius: "2px 2px 6px 6px", backgroundColor: "#a56438" }} />
    </Box>
  );
}
function PlantHanging() {
  return (
    <Box sx={{ position: "absolute", top: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Box sx={{ width: 2, height: 14, backgroundColor: "#c9b896" }} />
      <Box sx={{ width: 26, height: 16, borderRadius: "3px 3px 8px 8px", backgroundColor: "#b5713f" }} />
      {[-8, 0, 8].map((dx) => (
        <Box key={dx} sx={{ position: "absolute", top: 26, left: `calc(50% + ${dx}px)`, width: 3, height: 22 + (dx === 0 ? 6 : 0), backgroundColor: "#6ea05f", borderRadius: 2, transformOrigin: "top", transform: `rotate(${dx}deg)` }} />
      ))}
    </Box>
  );
}

export interface OfficeAgentWithProjectType extends AgentSnapshot {
  projectType: "website" | "app";
}

interface OfficeFloorSceneProps {
  agents: OfficeAgentWithProjectType[];
  onSelectAgent: (agent: AgentSnapshot) => void;
}

// Das gesamte Buero - EIN durchgehender Raum, gegliedert nach echter
// Projekt-Zugehoerigkeit: "Meine Projekte" (alle 4 echten Projekte - es gibt
// aktuell keine als Kunde markierten Projekte in den Daten) und
// "Kundenprojekte" (bewusst leer statt erfunden), je unterteilt nach echtem
// project.type (Apps / Webseiten). Reines SVG/CSS, keine neue Library, keine
// Kennzahlen-Kacheln.
export const OfficeFloorScene = memo(function OfficeFloorScene({ agents, onSelectAgent }: OfficeFloorSceneProps) {
  const projectOrder: string[] = [];
  for (const a of agents) if (!projectOrder.includes(a.rule.projectId)) projectOrder.push(a.rule.projectId);

  const withColor = agents.map((agent) => ({ agent, color: colorForProject(agent.rule.projectId, projectOrder) }));
  const ownApps = withColor.filter((x) => x.agent.projectType === "app");
  const ownWebsites = withColor.filter((x) => x.agent.projectType === "website");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const deskElsRef = useRef(new Map<string, HTMLDivElement>());
  const coffeeElRef = useRef<HTMLDivElement | null>(null);
  const fridgeElRef = useRef<HTMLDivElement | null>(null);
  const chillElRef = useRef<HTMLDivElement | null>(null);
  const [walker, setWalker] = useState<WalkerState | null>(null);
  const walkerRef = useRef<WalkerState | null>(null);
  walkerRef.current = walker;
  // In einem Ref statt direkt aus dem Closure gelesen, damit der unten
  // laufende setInterval() immer die aktuellen, live per React Query
  // aktualisierten Agenten-Daten sieht, ohne den Timer bei jedem Re-Render
  // (z.B. jede Realtime-Aktualisierung) neu aufzusetzen.
  const withColorRef = useRef(withColor);
  withColorRef.current = withColor;

  const registerDeskRef = useCallback((agentId: string, el: HTMLDivElement | null) => {
    if (el) deskElsRef.current.set(agentId, el);
    else deskElsRef.current.delete(agentId);
  }, []);
  const registerCoffeeRef = useCallback((el: HTMLDivElement | null) => {
    coffeeElRef.current = el;
  }, []);
  const registerFridgeRef = useCallback((el: HTMLDivElement | null) => {
    fridgeElRef.current = el;
  }, []);
  const registerChillRef = useCallback((el: HTMLDivElement | null) => {
    chillElRef.current = el;
  }, []);

  // Periodisch: eine echte, aktuell IDLE Person macht Pause an einem von
  // drei Zielen (Kaffee/Kuehlschrank/Chill Area, zufaellig gewaehlt) - Weg
  // wird live aus den tatsaechlichen Bildschirmpositionen berechnet. Die
  // Ref-Zuordnung lebt bewusst INNERHALB des Effekts (kein externes
  // Dependency-Problem) - die Refs selbst sind stabil, nur ihr .current
  // aendert sich.
  useEffect(() => {
    const interval = setInterval(() => {
      if (walkerRef.current) return;
      const idleCandidates = withColorRef.current.filter((x) => x.agent.status === "IDLE" && deskElsRef.current.has(x.agent.rule.id));
      if (idleCandidates.length === 0 || !containerRef.current) return;
      const destinationRefs: Record<WalkDestination, HTMLDivElement | null> = {
        coffee: coffeeElRef.current,
        fridge: fridgeElRef.current,
        chill: chillElRef.current,
      };
      const destinations: WalkDestination[] = ["coffee", "fridge", "chill"];
      const destination = destinations[Math.floor(Math.random() * destinations.length)]!;
      const destinationEl = destinationRefs[destination];
      if (!destinationEl) return;
      const pick = idleCandidates[Math.floor(Math.random() * idleCandidates.length)]!;
      const deskEl = deskElsRef.current.get(pick.agent.rule.id)!;
      const containerRect = containerRef.current.getBoundingClientRect();
      const deskRect = deskEl.getBoundingClientRect();
      const destRect = destinationEl.getBoundingClientRect();
      const from = { x: deskRect.left + deskRect.width / 2 - containerRect.left, y: deskRect.bottom - containerRect.top - 10 };
      const to = { x: destRect.left + destRect.width / 2 - containerRect.left, y: destRect.bottom - containerRect.top - 14 };

      setWalker({ agentId: pick.agent.rule.id, color: pick.color, destination, from, to, atDestination: false });
      const t1 = setTimeout(() => setWalker((w) => (w ? { ...w, atDestination: true } : w)), 1800);
      const t2 = setTimeout(() => setWalker((w) => (w ? { ...w, atDestination: false } : w)), 4600);
      const t3 = setTimeout(() => setWalker(null), 6400);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }, 9000);
    return () => clearInterval(interval);
  }, []);

  const walkerPos = walker ? (walker.atDestination ? walker.to : walker.from) : null;
  const fridgeOpen = walker?.destination === "fridge" && walker.atDestination;

  return (
    <Box
      ref={containerRef}
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
      <Box sx={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-95px)", width: 2, height: 30, backgroundColor: "#c9b896" }} />
      <Box sx={{ position: "absolute", top: 28, left: "50%", transform: "translateX(-116px)", width: 42, height: 20, borderRadius: "50% 50% 0 0", backgroundColor: "#f0e4c8", border: "1px solid #c9b896", boxShadow: "0 0 24px 6px rgba(255,224,150,0.35)", animation: "office-lamp-glow 3s ease-in-out infinite", "@keyframes office-lamp-glow": { "0%,100%": { boxShadow: "0 0 24px 6px rgba(255,224,150,0.25)" }, "50%": { boxShadow: "0 0 30px 10px rgba(255,224,150,0.5)" } } }} />

      {/* Regal (Deko) */}
      <Box sx={{ position: "absolute", top: 20, left: "50%", transform: "translateX(-190px)", display: { xs: "none", md: "block" } }}>
        <Box sx={{ width: 70, height: 46, border: "3px solid #a8804a", borderRadius: 1, position: "relative", backgroundColor: "rgba(200,163,107,0.15)" }}>
          <Box sx={{ position: "absolute", top: "50%", left: 0, right: 0, height: 3, backgroundColor: "#a8804a" }} />
          <Box sx={{ position: "absolute", top: 4, left: 6, width: 6, height: 16, backgroundColor: "#e8927a" }} />
          <Box sx={{ position: "absolute", top: 4, left: 14, width: 6, height: 14, backgroundColor: "#7fb3d5" }} />
          <Box sx={{ position: "absolute", top: 6, left: 22, width: 6, height: 12, backgroundColor: "#8fbf7f" }} />
          <Box sx={{ position: "absolute", bottom: 4, left: 8, width: 10, height: 8, borderRadius: "1px", backgroundColor: "#d9c48f" }} />
        </Box>
      </Box>

      {/* Projektor-Leinwand mit echtem Projektnamen (bayar-solutions - real
          bekannter Firmenname aus den Projektdaten, kein erfundenes Logo) */}
      <Box sx={{ position: "absolute", top: 18, left: "50%", transform: "translateX(20px)", display: { xs: "none", md: "block" } }}>
        <Box sx={{ width: 3, height: 10, mx: "auto", backgroundColor: "#8a8a8a" }} />
        <Box sx={{ width: 8, height: 5, mx: "auto", borderRadius: 1, backgroundColor: "#3a3a3a" }} />
        <Box
          sx={{
            mt: 1,
            width: 130,
            height: 60,
            borderRadius: "3px",
            backgroundColor: "#1c2128",
            border: "4px solid #efe6d8",
            boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            animation: "office-screen-flicker 5s ease-in-out infinite",
            "@keyframes office-screen-flicker": { "0%,96%,100%": { opacity: 1 }, "97%": { opacity: 0.85 } },
          }}
        >
          <Box sx={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.04em", color: "#f5f0e6" }}>BAYAR</Box>
          <Box sx={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.04em", color: "#f5f0e6" }}>SOLUTIONS</Box>
        </Box>
      </Box>

      {/* Diverse Pflanzen an mehreren Stellen im Raum */}
      <Box sx={{ position: "absolute", bottom: 16, left: 16 }}>
        <PlantTall />
      </Box>
      <Box sx={{ position: "absolute", bottom: 16, right: 16 }}>
        <PlantBushy />
      </Box>
      <Box sx={{ position: "absolute", top: 110, left: 30, display: { xs: "none", lg: "block" } }}>
        <PlantHanging />
      </Box>
      <Box sx={{ position: "absolute", top: 110, right: 30, display: { xs: "none", lg: "block" } }}>
        <PlantHanging />
      </Box>

      {/* LIVE-Badge */}
      <Box sx={{ position: "absolute", top: 14, left: 14, display: "flex", alignItems: "center", gap: 0.7, backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 5, px: 1.2, py: 0.4, boxShadow: "0 1px 4px rgba(0,0,0,0.1)", zIndex: 2 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#e53935", animation: "office-live-pulse 1.3s ease-in-out infinite", "@keyframes office-live-pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.3 } } }} />
        <Box sx={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.06em", color: "#444" }}>LIVE</Box>
      </Box>

      {/* Boden mit Abteilungen */}
      <Box sx={{ position: "relative", mt: "170px", pb: 4, px: { xs: 2, sm: 4 } }}>
        <Box sx={{ mb: 1 }}>
          <Box sx={{ fontSize: "0.85rem", fontWeight: 800, color: "#4a3d2a", mb: 1.5, pl: 0.5 }}>🏠 Meine Projekte</Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            <OfficeZone title="Apps" agents={ownApps} accentColor="#3b82f6" awayAgentId={walker?.agentId ?? null} onSelectAgent={onSelectAgent} registerDeskRef={registerDeskRef} emptyLabel="Keine aktiven Automation Rules für App-Projekte" />
            <OfficeZone title="Webseiten" agents={ownWebsites} accentColor="#14b8a6" awayAgentId={walker?.agentId ?? null} onSelectAgent={onSelectAgent} registerDeskRef={registerDeskRef} emptyLabel="Keine aktiven Automation Rules für Webseiten-Projekte" />
          </Box>
        </Box>

        <Box sx={{ mt: 3 }}>
          <Box sx={{ fontSize: "0.85rem", fontWeight: 800, color: "#4a3d2a", mb: 1.5, pl: 0.5 }}>💼 Kundenprojekte</Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            <OfficeZone title="Apps" agents={[]} accentColor="#9ca3af" awayAgentId={null} onSelectAgent={onSelectAgent} registerDeskRef={registerDeskRef} emptyLabel="Noch keine Kundenprojekte hinterlegt" />
            <OfficeZone title="Webseiten" agents={[]} accentColor="#9ca3af" awayAgentId={null} onSelectAgent={onSelectAgent} registerDeskRef={registerDeskRef} emptyLabel="Noch keine Kundenprojekte hinterlegt" />
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3, mt: 2 }}>
          <OfficeKitchen coffeeRef={registerCoffeeRef} fridgeRef={registerFridgeRef} fridgeOpen={fridgeOpen} />
          <OfficeChillArea chillRef={registerChillRef} />
        </Box>
      </Box>

      {/* Der laufende Charakter - echte, gemessene Start-/Zielposition, mit
          echtem Gang-Zyklus waehrend der Bewegung. Am Ziel angekommen haelt
          sie/er kurz das zum Ziel passende Item (Kaffee/Snack aus dem
          Kuehlschrank/entspannt in der Chill Area). */}
      {walker && walkerPos ? (
        <Box sx={{ position: "absolute", left: walkerPos.x, top: walkerPos.y, transform: "translate(-50%, -100%)", transition: "left 1.8s ease-in-out, top 1.8s ease-in-out", zIndex: 5, pointerEvents: "none" }}>
          {walker.atDestination ? (
            <Box sx={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", fontSize: 18 }}>{DESTINATION_ITEM[walker.destination]}</Box>
          ) : null}
          <OfficeCharacter status="IDLE" walking={!walker.atDestination} color={walker.color} label="Pause" onClick={() => undefined} tooltip="Pause" />
        </Box>
      ) : null}
    </Box>
  );
});
