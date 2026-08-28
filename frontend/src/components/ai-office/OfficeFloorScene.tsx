import { memo, useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import { OfficeCharacter } from "./OfficeCharacter";
import { AGENT_STATUS_LABEL } from "./officeConfig";
import type { AgentSnapshot } from "./officeConfig";
import type { Incident } from "../../types/incident.types";

const PROJECT_COLORS = ["#3b82f6", "#f97316", "#10b981", "#a855f7", "#eab308", "#ec4899", "#14b8a6"];

function colorForProject(projectId: string, order: string[]): string {
  const idx = order.indexOf(projectId);
  return PROJECT_COLORS[idx % PROJECT_COLORS.length] ?? "#3b82f6";
}

// "kaputt" heisst hier zweierlei, beide real: entweder die Automation-Regel
// selbst ist BLOCKED (ihre eigene Aktion ist fehlgeschlagen), oder das
// zugehoerige Projekt hat echten kritischen Health-Status/offene Incidents
// - selbst wenn die Regel-Aktion (z.B. "Snapshot on Check Failure") gerade
// erfolgreich durchlaeuft. Beides soll den Schreibtisch brennen lassen,
// sonst wuerde eine erfolgreich laufende Automation ein tatsaechlich
// kaputtes Projekt optisch als "alles ok" verstecken.
function isProjectBroken(agent: OfficeAgentWithProjectType): boolean {
  return Boolean(agent.projectHealth?.critical) || Boolean(agent.projectHealth && agent.projectHealth.openIncidents > 0);
}

function speechFor(agent: OfficeAgentWithProjectType): string | null {
  if (agent.status === "WORKING") return agent.rule.action.replace(/_/g, " ").toLowerCase();
  if (agent.status === "WAITING") return "wartet auf Freigabe...";
  if (agent.status === "BLOCKED") return agent.latestExecution?.error ? agent.latestExecution.error.slice(0, 46) : "blockiert";
  if (isProjectBroken(agent)) {
    const n = agent.projectHealth?.openIncidents ?? 0;
    return n > 0 ? `${n} offene${n === 1 ? "r" : ""} Incident${n === 1 ? "" : "s"}` : "Projekt kritisch";
  }
  return null;
}

// Rotierendes Alarm-Blinklicht statt Feuer (Nutzer-Feedback: die Flamme sah
// schlecht aus) - wie ein Rechenzentrum-/Einsatzfahrzeug-Warnlicht: rote
// Kuppel auf einem Sockel, ein rotierender Lichtkegel (conic-gradient) faehrt
// darum herum, dazu ein pulsierender Glutschein. Eindeutiges, "cooles"
// Alarm-Signal statt eines Feuers, passt thematisch besser zu einem
// IT-Ops-Buero ("Systemalarm" statt "brennender Tisch").
function OfficeAlarmBeacon() {
  return (
    <Box sx={{ position: "absolute", bottom: 58, zIndex: 3, width: 30, height: 34, pointerEvents: "none" }}>
      {/* Glutschein */}
      <Box
        sx={{
          position: "absolute",
          bottom: 6,
          left: "50%",
          transform: "translateX(-50%)",
          width: 34,
          height: 26,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(255,40,40,0.5) 0%, rgba(255,40,40,0) 70%)",
          animation: "office-beacon-glow 1s ease-in-out infinite",
          "@keyframes office-beacon-glow": { "0%,100%": { opacity: 0.5, transform: "translateX(-50%) scale(1)" }, "50%": { opacity: 1, transform: "translateX(-50%) scale(1.08)" } },
        }}
      />
      {/* Rotierender Lichtkegel hinter der Kuppel */}
      <Box
        sx={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          width: 28,
          height: 28,
          transform: "translateX(-50%)",
          borderRadius: "50%",
          overflow: "hidden",
          opacity: 0.8,
          animation: "office-beacon-spin 1s linear infinite",
          "@keyframes office-beacon-spin": { from: { transform: "translateX(-50%) rotate(0deg)" }, to: { transform: "translateX(-50%) rotate(360deg)" } },
        }}
      >
        <Box sx={{ position: "absolute", inset: 0, background: "conic-gradient(from 0deg, rgba(255,40,40,0.9) 0deg, rgba(255,40,40,0) 35deg, rgba(255,40,40,0) 325deg, rgba(255,40,40,0.9) 360deg)" }} />
      </Box>
      {/* Sockel */}
      <Box sx={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 16, height: 5, borderRadius: "2px", backgroundColor: "#3a3d44" }} />
      <Box sx={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)", width: 20, height: 4, borderRadius: "2px", backgroundColor: "#4a4d54" }} />
      {/* Kuppel */}
      <Box
        sx={{
          position: "absolute",
          bottom: 6,
          left: "50%",
          transform: "translateX(-50%)",
          width: 17,
          height: 13,
          borderRadius: "50% 50% 0 0",
          background: "linear-gradient(180deg,#ff7a68,#d6291a)",
          boxShadow: "0 0 9px 2px rgba(255,60,40,0.75)",
          animation: "office-beacon-pulse 1s ease-in-out infinite",
          "@keyframes office-beacon-pulse": { "0%,100%": { opacity: 0.9 }, "50%": { opacity: 1, boxShadow: "0 0 14px 4px rgba(255,60,40,0.9)" } },
        }}
      >
        {/* Glanzlicht */}
        <Box sx={{ position: "absolute", top: 2, left: 3, width: 4, height: 5, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.55)" }} />
      </Box>
    </Box>
  );
}

interface DeskProps {
  agent: OfficeAgentWithProjectType;
  color: string;
  away: boolean;
  onSelectAgent: (agent: OfficeAgentWithProjectType) => void;
  deskRef: (el: HTMLDivElement | null) => void;
}

// Ein Schreibtisch = eine echte Automation Rule (Phase 11): Tischplatte +
// Vorderkante + Beine + MacBook. "Kaputt" wird bewusst dramatisch
// dargestellt (brennender Schreibtisch + Rauch) - ausgeloest durch BLOCKED
// ODER echten kritischen Projekt-Zustand (isProjectBroken), nicht nur durch
// eine fehlgeschlagene Automation-Ausfuehrung. "away" = die Person ist
// gerade (Animation) unterwegs - der Schreibtisch bleibt sichtbar, aber
// leer (Stuhl statt Person), keine erfundene Anwesenheit.
const OfficeDesk = memo(function OfficeDesk({ agent, color, away, onSelectAgent, deskRef }: DeskProps) {
  const speech = speechFor(agent);
  const isBlocked = agent.status === "BLOCKED" || isProjectBroken(agent);

  return (
    <Box ref={deskRef} sx={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: 74 }}>
      {speech && !away ? (
        <Box sx={{ position: "absolute", bottom: "100%", mb: 0.5, maxWidth: { xs: 92, sm: 130 }, zIndex: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, backgroundColor: "#fff", color: "#2a2a2a", borderRadius: "10px 10px 10px 2px", px: 1, py: 0.5, boxShadow: "0 2px 6px rgba(0,0,0,0.18)", whiteSpace: "nowrap", overflow: "hidden" }}>
            <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: isBlocked ? "#e5533d" : color, flexShrink: 0 }} />
            <Box sx={{ fontSize: "0.6rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{speech}</Box>
          </Box>
          {/* Akzent-Balken unter der Blase nur bei "kaputt" - echtes
              Dringlichkeits-Signal, keine erfundene Prioritaet fuer andere
              Zustaende. */}
          {isBlocked ? <Box sx={{ height: 2.5, borderRadius: 2, mt: "2px", mx: 0.5, backgroundColor: "#e5533d" }} /> : null}
        </Box>
      ) : null}

      {/* Feuer bleibt auch waehrend "away" sichtbar - ein brennender
          Schreibtisch loescht sich nicht von selbst, nur weil die Person
          gerade Kaffee holt. Der Status des Schreibtischs/Projekts ist
          unabhaengig davon, ob die Person gerade dort sitzt. */}
      {isBlocked ? <OfficeAlarmBeacon /> : null}

      {away ? (
        <Box sx={{ width: 44, height: 48, display: "flex", alignItems: "flex-end", justifyContent: "center", opacity: 0.55 }}>
          {/* Leerer Stuhl - die Person ist gerade in der Kueche */}
          <Box sx={{ width: 17, height: 18, borderRadius: "3px 3px 0 0", border: "2.5px solid #8a6c3f", borderBottom: "none" }} />
        </Box>
      ) : (
        <OfficeCharacter
          status={agent.status}
          color={color}
          label={agent.projectName}
          onClick={() => onSelectAgent(agent)}
          tooltip={
            <Box>
              <Box sx={{ fontSize: "0.7rem", fontWeight: 700 }}>{agent.projectName}</Box>
              {/* Bei zusammengefassten Schreibtischen ("2 in einem") zeigt
                  der Tooltip zusaetzlich, wie viele echte Automation Rules
                  dahinterstecken - keine Information geht durchs
                  Zusammenfassen verloren. */}
              {agent.groupedRules.length > 1 ? (
                <Box sx={{ fontSize: "0.65rem" }}>{agent.groupedRules.length} Automation Rules</Box>
              ) : null}
              <Box sx={{ fontSize: "0.65rem" }}>{AGENT_STATUS_LABEL[agent.status]}</Box>
              {/* Echter Projekt-Zustand zusaetzlich zum (moeglicherweise
                  unveraenderten) Automation-Status - macht sichtbar, WARUM
                  der Schreibtisch brennt, auch wenn die Regel selbst gerade
                  erfolgreich laeuft. */}
              {isProjectBroken(agent) ? (
                <Box sx={{ fontSize: "0.65rem", color: "#e5533d", fontWeight: 700 }}>
                  {agent.projectHealth?.critical ? "Projekt kritisch" : "Projekt"}
                  {agent.projectHealth && agent.projectHealth.openIncidents > 0 ? ` · ${agent.projectHealth.openIncidents} offene Incidents` : ""}
                </Box>
              ) : null}
            </Box>
          }
        />
      )}

      {/* Schreibtisch: cremeweisses Podest + aufgeklapptes MacBook, dessen
          Deckel-Rueckseite zum Betrachter zeigt (der Bildschirm ist zur
          Person hin aufgeklappt - man sieht also nur den Deckel von hinten,
          wie bei einer Person, die tatsaechlich am Laptop sitzt). Der
          Schreibtisch ueberlappt die Figur jetzt deutlich mehr (mt) und
          liegt mit hoeherem zIndex davor, sodass die Person sichtbar
          "dahinter/darunter" sitzt - nur Gesicht + ein kleiner Rest der
          Schultern schauen noch drueber. */}
      <Tooltip title={AGENT_STATUS_LABEL[agent.status]} enterDelay={400}>
        <Box onClick={() => onSelectAgent(agent)} sx={{ position: "relative", mt: -1.25, zIndex: 2, cursor: "pointer" }}>
          {/* MacBook-Deckel (Rueckseite), steht auf dem Podest */}
          <Box
            sx={{
              position: "absolute",
              bottom: 15,
              left: "50%",
              transform: "translateX(-50%)",
              width: 34,
              height: 24,
              borderRadius: "3px 3px 1px 1px",
              background: "linear-gradient(180deg,#e6e8eb,#c7c9cc)",
              border: "1px solid #a9acb0",
              boxShadow: "0 3px 8px rgba(0,0,0,0.22)",
            }}
          >
            {/* Apfel-Silhouette als ein einzelner, sauber gerundeter Pfad
                (mit leichter Einbuchtung oben, wo der Stiel sitzt) statt
                zweier grosser sich ueberlappender Kreise - die vorherige
                Version sah bei der kleinen Groesse eher wie ein Delfin aus. */}
            <Box component="svg" viewBox="0 0 22 22" sx={{ position: "absolute", top: "46%", left: "50%", transform: "translate(-50%,-50%)", width: 11, height: 11, opacity: 0.75 }}>
              <path d="M11 6 C8.5 3 3.5 4.5 3.5 11 C3.5 16.5 7 19.5 11 18.7 C15 19.5 18.5 16.5 18.5 11 C18.5 4.5 13.5 3 11 6 Z" fill={isBlocked ? "#e5533d" : color} />
              <rect x="10.3" y="1.2" width="1.4" height="4" rx="0.6" fill="#5c4835" />
              <ellipse cx="13.4" cy="2.6" rx="2.6" ry="1.3" fill="#6ea05f" transform="rotate(-20 13.4 2.6)" />
            </Box>
          </Box>
          {/* Podest (Draufsicht) */}
          <Box sx={{ width: 58, height: 15, borderRadius: "7px", backgroundColor: isBlocked ? "#f0cdbd" : "#f7f3ea", border: "1px solid rgba(0,0,0,0.06)", boxShadow: isBlocked ? "0 4px 14px rgba(220,80,30,0.4)" : "0 3px 8px rgba(0,0,0,0.14)" }} />
          <Box sx={{ position: "absolute", bottom: -8, left: 5, width: 2.5, height: 8, backgroundColor: "#9aa1a8" }} />
          <Box sx={{ position: "absolute", bottom: -8, right: 5, width: 2.5, height: 8, backgroundColor: "#9aa1a8" }} />
        </Box>
      </Tooltip>

      {/* Echtes, aus dem echten Projektnamen abgeleitetes Kuerzel (z.B.
          "DriveConnect" -> "DC") statt des vollen, oft zu langen
          Automation-Rule-Namens - kompakter, besonders auf dem Handy. */}
      <Box sx={{ mt: 0.75, fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.04em", color: "#8b7d68", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 70, textAlign: "center" }}>
        {agent.deskLabel}
      </Box>
    </Box>
  );
});

interface ZoneProps {
  title: string;
  agents: { agent: OfficeAgentWithProjectType; color: string }[];
  emptyLabel?: string;
  accentColor: string;
  awayAgentIds: Set<string>;
  onSelectAgent: (agent: OfficeAgentWithProjectType) => void;
  registerDeskRef: (agentId: string, el: HTMLDivElement | null) => void;
}

// Kein umrandeter "Karten"-Kasten mehr um die Gruppe - die Tische stehen
// direkt auf dem offenen Boden (Video-Referenz: keine sichtbaren
// Box-Grenzen zwischen den Bereichen, nur Abstand + Label sorgen fuer
// Gliederung).
const OfficeZone = memo(function OfficeZone({ title, agents, emptyLabel, accentColor, awayAgentIds, onSelectAgent, registerDeskRef }: ZoneProps) {
  return (
    <Box sx={{ flex: 1, minWidth: 200 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.5, px: 0.5 }}>
        <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: accentColor }} />
        <Box sx={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.05em", color: "#6b5c47", textTransform: "uppercase" }}>{title}</Box>
      </Box>
      {/* Groesserer Zeilenabstand (rowGap) auf schmalen Breiten, wo Tische
          in mehrere Zeilen umbrechen - die Sprechblase eines Tisches
          "waechst" nach oben ueber seine Zeile hinaus (bottom:100%) und
          wuerde bei zu knappem Zeilenabstand das Label der Zeile darueber
          verdecken. */}
      <Box sx={{ minHeight: 90, display: "flex", flexWrap: "wrap", alignItems: "flex-end", rowGap: { xs: 4.5, sm: 2.5 }, columnGap: 2.5, px: 0.5 }}>
        {agents.length === 0 ? (
          <Box sx={{ color: "#a3937a", fontSize: "0.72rem", fontStyle: "italic" }}>{emptyLabel ?? "Noch niemand hier"}</Box>
        ) : (
          agents.map(({ agent, color }) => (
            <OfficeDesk key={agent.deskId} agent={agent} color={color} away={awayAgentIds.has(agent.deskId)} onSelectAgent={onSelectAgent} deskRef={(el) => registerDeskRef(agent.deskId, el)} />
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
    <Box sx={{ position: "relative", width: 300, maxWidth: "100%" }}>
      <Box sx={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.05em", color: "#6b5c47", textTransform: "uppercase", textAlign: "center", mb: 1.5 }}>
        ☕ Küche
      </Box>
      <Box sx={{ position: "relative", height: 90, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3 }}>
        {/* Kuehlschrank mit echter Tuer-Oeffnen-Animation */}
        <Box ref={fridgeRef} sx={{ position: "relative", width: 32, height: 51, borderRadius: "4px", backgroundColor: "#2a2d33", perspective: "160px" }}>
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
            <Box sx={{ position: "absolute", top: 14, left: 0, right: 0, height: 2, backgroundColor: "#b8bec4" }} />
            <Box sx={{ position: "absolute", top: 4, right: 2, width: 2.5, height: 8, borderRadius: 2, backgroundColor: "#9aa1a8" }} />
            <Box sx={{ position: "absolute", top: 20, right: 2, width: 2.5, height: 14, borderRadius: 2, backgroundColor: "#9aa1a8" }} />
          </Box>
        </Box>

        {/* Espressomaschine - Gruppenkopf, Tasse, Dampf statt Server-Optik */}
        <Box ref={coffeeRef} sx={{ position: "relative" }}>
          {/* Arbeitsplatte */}
          <Box sx={{ width: 56, height: 6, backgroundColor: "#c8a36b", borderRadius: "2px", mb: "-1px" }} />
          {/* Maschinenkoerper */}
          <Box sx={{ position: "relative", mx: "auto", width: 37, height: 24, borderRadius: "6px 6px 3px 3px", background: "linear-gradient(180deg,#3a3d44,#26282d)", boxShadow: "0 2px 4px rgba(0,0,0,0.3)" }}>
            {/* Chrom-Zierstreifen */}
            <Box sx={{ position: "absolute", top: 2, left: 3, right: 3, height: 2.5, borderRadius: 2, backgroundColor: "#c9ccd1" }} />
            {/* Bedienknoepfe */}
            <Box sx={{ position: "absolute", top: 7, left: 5, width: 3, height: 3, borderRadius: "50%", backgroundColor: "#e85a4f" }} />
            <Box sx={{ position: "absolute", top: 7, left: 10.5, width: 3, height: 3, borderRadius: "50%", backgroundColor: "#7fbf6f" }} />
            {/* Gruppenkopf (Bruehgruppe) */}
            <Box sx={{ position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)", width: 11, height: 6, backgroundColor: "#1c1e22", borderRadius: "1px" }} />
          </Box>
          {/* Tasse unter dem Gruppenkopf */}
          <Box sx={{ position: "relative", mx: "auto", mt: "6px", width: 10, height: 8, borderRadius: "0 0 4px 4px", backgroundColor: "#fff", border: "1.5px solid #d8d0c0" }}>
            <Box
              sx={{
                position: "absolute",
                top: -12,
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 10,
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
          <Box sx={{ width: 50, height: 6, borderRadius: 1, backgroundColor: "#c8a36b", position: "relative" }}>
            <Box sx={{ position: "absolute", bottom: -11, left: 3, width: 2.5, height: 11, backgroundColor: "#8a6c3f" }} />
            <Box sx={{ position: "absolute", bottom: -11, right: 3, width: 2.5, height: 11, backgroundColor: "#8a6c3f" }} />
            <Box sx={{ position: "absolute", top: -10, left: 5, fontSize: 12 }}>☕</Box>
            <Box sx={{ position: "absolute", top: -10, left: 20, fontSize: 12 }}>🍪</Box>
            <Box sx={{ position: "absolute", top: -10, right: 5, fontSize: 12 }}>☕</Box>
          </Box>
          <Box sx={{ position: "absolute", bottom: -5, left: -13, width: 9, height: 13, border: "2px solid #a8804a", borderBottom: "none", borderRadius: "2px 2px 0 0" }} />
          <Box sx={{ position: "absolute", bottom: -5, right: -13, width: 9, height: 13, border: "2px solid #a8804a", borderBottom: "none", borderRadius: "2px 2px 0 0" }} />
        </Box>
      </Box>
    </Box>
  );
});

// Chill Area: mehrere einzelne Betten (statt einer Couch) + Shisha +
// kleiner Beistelltisch - damit tatsaechlich mehrere Personen gleichzeitig
// dort liegen/schlafen koennen, statt sich einen einzigen Liegeplatz zu
// teilen. Jedes Bett ist ein eigenes, reales Laufziel (registerBedRef).
// Deutlich mehr Abstand zwischen den Betten als in der ersten Version
// (waren vorher fast beruehrend nebeneinander).
const BED_COUNT = 3;
const OfficeChillArea = memo(function OfficeChillArea({ registerBedRef }: { registerBedRef: (index: number, el: HTMLDivElement | null) => void }) {
  return (
    <Box sx={{ position: "relative", width: 360, maxWidth: "100%" }}>
      <Box sx={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.05em", color: "#6b5c47", textTransform: "uppercase", textAlign: "center", mb: 1.5 }}>
        🛏️ Chill Area
      </Box>
      <Box sx={{ position: "relative", height: 90, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4 }}>
        {/* Einzelbetten - schlichter, flacher Stil (Video-Referenz): ein
            Kissen in Akzentfarbe auf dunkelgrauer Matratze. */}
        {Array.from({ length: BED_COUNT }, (_, i) => (
          <Box key={i} ref={(el: HTMLDivElement | null) => registerBedRef(i, el)} sx={{ position: "relative", width: 46, height: 22 }}>
            <Box sx={{ position: "absolute", bottom: 0, width: "100%", height: 16, borderRadius: "6px", backgroundColor: "#4a4f57" }} />
            <Box sx={{ position: "absolute", bottom: 3, left: 3, width: 14, height: 10, borderRadius: "3px", backgroundColor: "#e08a4f" }} />
            <Box sx={{ position: "absolute", bottom: -4, left: 2, width: 3, height: 5, backgroundColor: "#33373d", borderRadius: 1 }} />
            <Box sx={{ position: "absolute", bottom: -4, right: 2, width: 3, height: 5, backgroundColor: "#33373d", borderRadius: 1 }} />
          </Box>
        ))}

        {/* Shisha auf kleinem Tisch */}
        <Box sx={{ position: "relative", width: 32 }}>
          <Box sx={{ width: 32, height: 5, borderRadius: 1, backgroundColor: "#c8a36b" }} />
          <Box sx={{ position: "absolute", bottom: -8, left: 3, width: 2.5, height: 8, backgroundColor: "#8a6c3f" }} />
          <Box sx={{ position: "absolute", bottom: -8, right: 3, width: 2.5, height: 8, backgroundColor: "#8a6c3f" }} />
          {/* Shisha-Silhouette: Vase + Rohr + Kopf */}
          <Box sx={{ position: "absolute", bottom: 5, left: "50%", transform: "translateX(-50%)", width: 11, height: 14, borderRadius: "40% 40% 60% 60% / 50% 50% 70% 70%", background: "linear-gradient(180deg,#c9a86a,#7fbf9f)", opacity: 0.9 }} />
          <Box sx={{ position: "absolute", bottom: 17, left: "50%", transform: "translateX(-50%)", width: 2.5, height: 6, backgroundColor: "#8a8a8a" }} />
          <Box sx={{ position: "absolute", bottom: 23, left: "50%", transform: "translateX(-50%)", width: 6, height: 4, borderRadius: 1, backgroundColor: "#3a3a3a" }} />
          <Box
            sx={{
              position: "absolute",
              bottom: 27,
              left: "60%",
              width: 2.5,
              height: 2.5,
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

// Leseecke: groesseres Buecherregal + Leseecke-Couch mit SEAT_COUNT
// einzelnen Sitzplaetzen - viertes Pausenziel, damit Personen nicht nur
// einzeln stehend lesen, sondern zu mehreert nebeneinander auf der Couch
// sitzen und lesen koennen. Jeder Sitzplatz ist ein eigenes, reales Laufziel
// (registerSeatRef), genau wie die Betten in der Chill Area.
const SEAT_COUNT = 3;
const OfficeReadingCorner = memo(function OfficeReadingCorner({ registerSeatRef }: { registerSeatRef: (index: number, el: HTMLDivElement | null) => void }) {
  return (
    <Box sx={{ position: "relative", width: 300, maxWidth: "100%" }}>
      <Box sx={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.05em", color: "#6b5c47", textTransform: "uppercase", textAlign: "center", mb: 1.5 }}>
        📚 Leseecke
      </Box>
      <Box sx={{ position: "relative", height: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4 }}>
        {/* Buecherregal - groesser als zuvor */}
        <Box sx={{ position: "relative", width: 56, height: 78, border: "3px solid #a8804a", borderRadius: 1, backgroundColor: "rgba(200,163,107,0.15)" }}>
          <Box sx={{ position: "absolute", top: "25%", left: 0, right: 0, height: 3, backgroundColor: "#a8804a" }} />
          <Box sx={{ position: "absolute", top: "50%", left: 0, right: 0, height: 3, backgroundColor: "#a8804a" }} />
          <Box sx={{ position: "absolute", top: "75%", left: 0, right: 0, height: 3, backgroundColor: "#a8804a" }} />
          <Box sx={{ position: "absolute", top: 4, left: 4, width: 6, height: 18, backgroundColor: "#e8927a" }} />
          <Box sx={{ position: "absolute", top: 4, left: 13, width: 6, height: 16, backgroundColor: "#7fb3d5" }} />
          <Box sx={{ position: "absolute", top: 6, left: 22, width: 6, height: 14, backgroundColor: "#8fbf7f" }} />
          <Box sx={{ position: "absolute", top: 4, left: 31, width: 6, height: 18, backgroundColor: "#e0c168" }} />
          <Box sx={{ position: "absolute", top: 4, left: 40, width: 6, height: 16, backgroundColor: "#c98fd5" }} />
          <Box sx={{ position: "absolute", top: "29%", left: 4, width: 6, height: 16, backgroundColor: "#c98fd5" }} />
          <Box sx={{ position: "absolute", top: "29%", left: 13, width: 6, height: 18, backgroundColor: "#7fb3d5" }} />
          <Box sx={{ position: "absolute", top: "29%", left: 22, width: 6, height: 14, backgroundColor: "#e8927a" }} />
          <Box sx={{ position: "absolute", top: "29%", left: 31, width: 6, height: 16, backgroundColor: "#8fbf7f" }} />
          <Box sx={{ position: "absolute", bottom: 4, left: 6, width: 20, height: 7, borderRadius: "1px", backgroundColor: "#d9c48f" }} />
          <Box sx={{ position: "absolute", bottom: 4, left: 28, width: 18, height: 7, borderRadius: "1px", backgroundColor: "#e0a870" }} />
        </Box>
        {/* Leseecke-Couch mit 3 einzelnen Sitzplaetzen */}
        <Box sx={{ position: "relative", width: 150, height: 30 }}>
          <Box sx={{ position: "absolute", bottom: 0, width: "100%", height: 22, borderRadius: "10px", backgroundColor: "#8a6f52" }} />
          <Box sx={{ position: "absolute", bottom: 15, width: "100%", height: 18, borderRadius: "10px 10px 4px 4px", backgroundColor: "#9c7f5f" }} />
          {Array.from({ length: SEAT_COUNT }, (_, i) => (
            <Box key={i} ref={(el: HTMLDivElement | null) => registerSeatRef(i, el)} sx={{ position: "absolute", bottom: 17, left: 8 + i * 46, width: 36, height: 14, borderRadius: "4px", backgroundColor: "#ac8f6f" }} />
          ))}
          <Box sx={{ position: "absolute", bottom: -5, left: 5, width: 4, height: 6, backgroundColor: "#5c4835", borderRadius: 1 }} />
          <Box sx={{ position: "absolute", bottom: -5, right: 5, width: 4, height: 6, backgroundColor: "#5c4835", borderRadius: 1 }} />
        </Box>
      </Box>
    </Box>
  );
});

// Sitzende Figur fuer die Leseecke - eigene, einfache Silhouette (analog zu
// OfficeLyingCharacter) statt einer gedrehten OfficeCharacter: kurze
// angewinkelte Beine, aufrechter Oberkoerper, ein Buch in den Haenden.
function OfficeSittingCharacter({ color }: { color: string }) {
  const skin = "#e8b48a";
  const hair = "#3b2a1a";
  return (
    <Box
      sx={{
        position: "relative",
        width: 32,
        height: 40,
        animation: "office-sitting-breathe 3.2s ease-in-out infinite",
        "@keyframes office-sitting-breathe": { "0%,100%": { transform: "scaleY(1)" }, "50%": { transform: "scaleY(0.985)" } },
      }}
    >
      <Box component="svg" viewBox="0 0 32 40" sx={{ width: 32, height: 40, display: "block" }}>
        {/* Angewinkelte Sitzbeine */}
        <rect x="5" y="30" width="9" height="8" rx="3" fill="#2b333f" />
        <rect x="18" y="30" width="9" height="8" rx="3" fill="#37414f" />
        {/* Koerper */}
        <rect x="6" y="14" width="20" height="18" rx="8" fill={color} />
        {/* Buch in den Haenden */}
        <rect x="9" y="20" width="14" height="10" rx="1" fill="#f5f0e6" stroke="#d8d0c0" strokeWidth="1" />
        <rect x="15.5" y="20" width="1" height="10" fill="#d8d0c0" />
        {/* Kopf, leicht nach unten geneigt (liest) */}
        <circle cx="16" cy="9" r="9" fill={skin} />
        <ellipse cx="16" cy="4.5" rx="9" ry="5" fill={hair} />
        <path d="M11 11 q2 1.4 4 0" stroke="#3b2a1a" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <path d="M17 11 q2 1.4 4 0" stroke="#3b2a1a" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </Box>
    </Box>
  );
}

// Liegende Figur fuer die Chill Area - eigene, einfache Silhouette statt
// einer gedrehten OfficeCharacter (deren Gliedmassen/Pivots auf die
// stehende Pose zugeschnitten sind). Kopf liegt am linken Ende auf dem
// Akzent-Kissen der Couch (das dort tatsaechlich positioniert ist - Kopf
// woanders hinzulegen ergaebe keinen Sinn), Beine haengen rechts ueber die
// Armlehne. Gesicht (entspannte geschlossene Augen + kleines Laecheln)
// passend zum "Pause"-Zustand.
function OfficeLyingCharacter({ color }: { color: string }) {
  const skin = "#e8b48a";
  const hair = "#3b2a1a";
  return (
    <Box
      sx={{
        position: "relative",
        width: 66,
        height: 30,
        animation: "office-lying-breathe 3.2s ease-in-out infinite",
        "@keyframes office-lying-breathe": { "0%,100%": { transform: "scaleX(1)" }, "50%": { transform: "scaleX(0.985)" } },
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: -14,
          left: -2,
          fontSize: 14,
          animation: "office-char-zzz 2.4s ease-in-out infinite",
          "@keyframes office-char-zzz": { "0%,100%": { opacity: 0.3, transform: "translateY(0)" }, "50%": { opacity: 1, transform: "translateY(-4px)" } },
        }}
      >
        💤
      </Box>
      <Box component="svg" viewBox="0 0 66 30" sx={{ width: 66, height: 30, display: "block" }}>
        {/* Beine - jetzt am rechten Ende (weg vom Kissen) */}
        <rect x="51" y="19" width="15" height="7" rx="3" fill="#2b333f" />
        {/* Koerper liegend */}
        <rect x="23" y="12" width="32" height="14" rx="7" fill={color} />
        {/* Kopf am linken Ende, dort wo das Kissen der Couch liegt */}
        <circle cx="12" cy="16" r="12" fill={skin} />
        <ellipse cx="12" cy="9" rx="12" ry="6.5" fill={hair} />
        {/* Gesicht: entspannte geschlossene Augen + kleines Laecheln */}
        <path d="M5.5 18 q2.5 -2 5 0" stroke="#3b2a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M13.5 18 q2.5 -2 5 0" stroke="#3b2a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M7.5 22.5 q4.5 1.8 9 0" stroke="#8a5a3b" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </Box>
    </Box>
  );
}

// Echte, laufende Personen zwischen ihrem echten Schreibtisch und einem von
// vier Zielen (Kaffee/Kuehlschrank/Chill Area/Leseecke) - Position wird per
// getBoundingClientRect() der tatsaechlichen DOM-Elemente gemessen (kein
// geratener/fixer Pfad), animiert per CSS-transition. Auf Nutzerwunsch
// duerfen alle Agenten ausser BLOCKED herumlaufen (Working/Waiting/
// Completed/Idle) - einzig "kaputt" (brennender Schreibtisch) soll optisch
// zaehlen, der sonstige Status ist fuer die Laufanimation irrelevant.
// Mehrere Agenten koennen gleichzeitig unterwegs sein (nicht nur einer nach
// dem anderen) - "sie muessen nicht standardmaessig am Platz sein". Jedes
// Ziel hat einen echten Zweck (Kaffee holen/Kuehlschrank/liegen/lesen)
// statt aufs freie Herumstehen auf leerer Flaeche.
type WalkDestination = "coffee" | "fridge" | "chill" | "books";
const DESTINATION_ITEM: Record<WalkDestination, string> = { coffee: "☕", fridge: "🥤", chill: "😌", books: "📖" };
// Nutzerwunsch: Leute sollen deutlich oefter/mehr gleichzeitig unterwegs
// sein, auch wenn das "unnoetig" ist - erhoeht gegenueber vorher (3).
const MAX_CONCURRENT_WALKERS = 6;

// Konstante Gehgeschwindigkeit statt fixer Dauer - vorher liefen alle
// Strecken (kurz oder lang) in derselben Zeit ab, wirkte je nach Distanz
// mal zu schnell, mal zu langsam. Dauer wird jetzt aus der tatsaechlich
// gemessenen Distanz berechnet, mit sinnvollen Grenzen nach oben/unten.
const WALK_SPEED_PX_PER_MS = 0.2;
const MIN_WALK_MS = 900;
const MAX_WALK_MS = 3200;

interface WalkerState {
  agentId: string;
  color: string;
  destination: WalkDestination;
  // Nur gesetzt bei destination === "chill" (welches Bett) oder "books"
  // (welcher Sitzplatz) - damit sich zwei Personen nicht denselben Platz
  // teilen. Reserviert schon beim Losgehen, nicht erst bei Ankunft.
  slotIndex?: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  // "pos" ist bewusst vom Lauf-/Ankunfts-Status getrennt: sie treibt
  // ausschliesslich die CSS-left/top-Transition. Aendert sich "pos" auf dem
  // Hinweg NICHT im selben Tick, in dem "walking" auf false springt (der
  // urspruengliche Bug - Beine/Arme froren genau dann ein, wenn die Figur
  // tatsaechlich zu gleiten begann), sondern waehrend "walking" die ganze
  // Gleitdauer ueber true bleibt.
  pos: { x: number; y: number };
  // Dauer der aktuellen Gleit-Transition, aus der echten Distanz berechnet
  // (konstante Geschwindigkeit statt fixer Dauer fuer alle Strecken).
  durationMs: number;
  walking: boolean;
  atDestination: boolean;
}

// Diverse, unterschiedlich geformte Pflanzen statt eines einzigen,
// kaktusartigen Topfs - je Position eine andere Silhouette.
function PlantTall() {
  return (
    <Box sx={{ position: "relative", width: 27, height: 56 }}>
      <Box sx={{ position: "absolute", bottom: 11, left: "50%", transform: "translateX(-50%)", width: 2.5, height: 24, backgroundColor: "#6b8a4f" }} />
      {[[-8, 5, -18], [6, -2, 14], [-3, -11, -4]].map(([dx, dy, rot], i) => (
        <Box key={i} sx={{ position: "absolute", bottom: 32 + (dy ?? 0), left: `calc(50% + ${dx}px)`, width: 18, height: 11, borderRadius: "50% 50% 50% 0", backgroundColor: i % 2 === 0 ? "#5a8a5f" : "#6ea05f", transform: `rotate(${rot}deg)` }} />
      ))}
      <Box sx={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 21, height: 16, borderRadius: "2px 2px 8px 8px", backgroundColor: "#b5713f" }} />
    </Box>
  );
}
function PlantBushy() {
  return (
    <Box sx={{ position: "relative", width: 24, height: 32 }}>
      <Box sx={{ width: 24, height: 21, borderRadius: "50% 50% 40% 40% / 65% 65% 25% 25%", backgroundColor: "#4f7a54" }} />
      <Box sx={{ position: "absolute", top: 5, left: -2, width: 13, height: 13, borderRadius: "50%", backgroundColor: "#5c8f5f" }} />
      <Box sx={{ position: "absolute", top: 3, right: -2, width: 11, height: 11, borderRadius: "50%", backgroundColor: "#6ea05f" }} />
      <Box sx={{ width: 18, height: 13, mx: "auto", borderRadius: "2px 2px 6px 6px", backgroundColor: "#a56438" }} />
    </Box>
  );
}
function PlantHanging() {
  return (
    <Box sx={{ position: "absolute", top: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Box sx={{ width: 2, height: 11, backgroundColor: "#c9b896" }} />
      <Box sx={{ width: 21, height: 13, borderRadius: "3px 3px 8px 8px", backgroundColor: "#b5713f" }} />
      {[-6, 0, 6].map((dx) => (
        <Box key={dx} sx={{ position: "absolute", top: 21, left: `calc(50% + ${dx}px)`, width: 2.5, height: 18 + (dx === 0 ? 5 : 0), backgroundColor: "#6ea05f", borderRadius: 2, transformOrigin: "top", transform: `rotate(${dx}deg)` }} />
      ))}
    </Box>
  );
}

export interface OfficeAgentWithProjectType extends AgentSnapshot {
  projectType: "website" | "app";
  // Echter Projekt-Zustand (dashboard/projects) - unabhaengig vom
  // Automation-Rule-Status, siehe isProjectBroken()/speechFor() weiter oben.
  projectHealth: { critical: boolean; openIncidents: number } | null;
  // Echte offene Incidents dieses Projekts (api/incidents) - der konkrete
  // Grund, der im Detail-Drawer beim Klick auf einen brennenden
  // Schreibtisch angezeigt wird, statt nur eines Zaehlers.
  openIncidents: Incident[];
  // Nutzerwunsch: "ein Schreibtisch pro Projekt" statt "ein Schreibtisch pro
  // Automation Rule" (z.B. Rechno/bayar-solutions.de mit je 2 echten Regeln
  // -> nur EIN Schreibtisch, der beide zusammenfasst). deskId ersetzt
  // rule.id als stabile Identitaet fuer Key/Lauf-Ziel/Away-Tracking, da
  // rule.id bei mehreren zusammengefassten Regeln nicht mehr eindeutig fuer
  // "diesen Schreibtisch" waere.
  deskId: string;
  // Echter (nur gekuerzter) Projektname statt eines einzelnen Regelnamens -
  // siehe abbreviateProjectName() in AiOperationsOffice.tsx.
  deskLabel: string;
  projectName: string;
  // Alle echten Automation Rules, die dieser Schreibtisch zusammenfasst
  // (>= 1 Eintrag) - der Detail-Drawer zeigt bei mehreren Eintraegen jede
  // Regel einzeln ("2 in einem", nichts wird versteckt).
  groupedRules: AgentSnapshot[];
}

interface OfficeFloorSceneProps {
  agents: OfficeAgentWithProjectType[];
  onSelectAgent: (agent: OfficeAgentWithProjectType) => void;
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
  // Ein Ref pro Bett/Sitzplatz (statt einem einzelnen Ziel), damit mehrere
  // Personen gleichzeitig liegen bzw. nebeneinander lesend sitzen koennen.
  const bedElsRef = useRef(new Map<number, HTMLDivElement>());
  const seatElsRef = useRef(new Map<number, HTMLDivElement>());
  // Mehrere gleichzeitige Laeufer statt einem einzelnen - "sie muessen nicht
  // standardmaessig am Platz sein", jede real IDLE Person kann unabhaengig
  // unterwegs sein.
  const [walkers, setWalkers] = useState<Map<string, WalkerState>>(new Map());
  const walkersRef = useRef<Map<string, WalkerState>>(walkers);
  walkersRef.current = walkers;
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
  const registerBedRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) bedElsRef.current.set(index, el);
    else bedElsRef.current.delete(index);
  }, []);
  const registerSeatRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) seatElsRef.current.set(index, el);
    else seatElsRef.current.delete(index);
  }, []);

  // Periodisch: bis zu MAX_CONCURRENT_WALKERS real IDLE Personen sind
  // gleichzeitig unterwegs (Kaffee/Kuehlschrank/Chill Area/Leseecke,
  // zufaellig gewaehlt) statt nacheinander eine einzelne Person - "sie
  // muessen nicht standardmaessig am Platz sein". Weg wird live aus den
  // tatsaechlichen Bildschirmpositionen berechnet. Die Ref-Zuordnung lebt
  // bewusst INNERHALB des Effekts (kein externes Dependency-Problem) - die
  // Refs selbst sind stabil, nur ihr .current aendert sich.
  useEffect(() => {
    // setInterval()-Rueckgabewerte von Callback-Funktionen werden vom
    // Browser NIE aufgerufen - anders als bei useEffect()-Cleanups muss die
    // Aufraeum-Logik hier explizit selbst verwaltet werden (Timeout-IDs in
    // einem Array sammeln, im Effekt-Cleanup gemeinsam clearen).
    const pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, ms: number) => {
      pendingTimeouts.push(setTimeout(fn, ms));
    };
    const updateWalker = (agentId: string, updater: (w: WalkerState) => WalkerState | null) => {
      setWalkers((prev) => {
        const existing = prev.get(agentId);
        if (!existing) return prev;
        const next = updater(existing);
        const copy = new Map(prev);
        if (next) copy.set(agentId, next);
        else copy.delete(agentId);
        return copy;
      });
    };

    const interval = setInterval(() => {
      if (!containerRef.current) return;
      const current = walkersRef.current;
      if (current.size >= MAX_CONCURRENT_WALKERS) return;
      // Nicht bei jeder Gelegenheit sofort jemanden losschicken - staffelt
      // die Starts natuerlicher, statt dass immer alle auf einmal aufstehen.
      // Schwelle deutlich erhoeht (Nutzerwunsch: oefter/mehr Leute unterwegs).
      if (Math.random() > 0.85) return;
      // Auf Nutzerwunsch laufen alle Nicht-BLOCKED-Agenten herum, unabhaengig
      // vom sonstigen Status (Working/Waiting/Completed/Idle) - einzig
      // "kaputt" (BLOCKED, brennender Schreibtisch) soll optisch zaehlen,
      // der Rest ist fuer die Laufanimation irrelevant.
      const eligibleCandidates = withColorRef.current.filter((x) => x.agent.status !== "BLOCKED" && deskElsRef.current.has(x.agent.deskId) && !current.has(x.agent.deskId));
      if (eligibleCandidates.length === 0) return;

      const destinations: WalkDestination[] = ["coffee", "fridge", "chill", "books"];
      const destination = destinations[Math.floor(Math.random() * destinations.length)]!;
      const pick = eligibleCandidates[Math.floor(Math.random() * eligibleCandidates.length)]!;
      const agentId = pick.agent.deskId;
      const deskEl = deskElsRef.current.get(agentId)!;
      const containerRect = containerRef.current.getBoundingClientRect();
      const deskRect = deskEl.getBoundingClientRect();
      const from = { x: deskRect.left + deskRect.width / 2 - containerRect.left, y: deskRect.bottom - containerRect.top - 10 };

      let to: { x: number; y: number };
      let slotIndex: number | undefined;
      if (destination === "chill" || destination === "books") {
        // Freien Platz suchen (Bett bzw. Sitzplatz) - keiner teilt sich
        // einen Platz mit jemand anderem. Real gemessen, wird schon beim
        // Losgehen reserviert (slotIndex bleibt fuer die gesamte Pause
        // gesetzt, damit niemand sonst denselben Platz waehlt).
        const slotEls = destination === "chill" ? bedElsRef.current : seatElsRef.current;
        const slotCount = destination === "chill" ? BED_COUNT : SEAT_COUNT;
        const occupied = new Set(
          Array.from(current.values())
            .filter((w) => w.destination === destination)
            .map((w) => w.slotIndex),
        );
        const freeIndex = Array.from({ length: slotCount }, (_, i) => i).find((i) => !occupied.has(i) && slotEls.has(i));
        if (freeIndex === undefined) return;
        const slotRect = slotEls.get(freeIndex)!.getBoundingClientRect();
        to = { x: slotRect.left + slotRect.width / 2 - containerRect.left, y: slotRect.bottom - containerRect.top - 14 };
        slotIndex = freeIndex;
      } else {
        const destinationEl = destination === "coffee" ? coffeeElRef.current : fridgeElRef.current;
        if (!destinationEl) return;
        const destRect = destinationEl.getBoundingClientRect();
        to = { x: destRect.left + destRect.width / 2 - containerRect.left, y: destRect.bottom - containerRect.top - 14 };
      }

      // Konstante Geschwindigkeit: Dauer aus der echten Distanz berechnet,
      // statt einer fixen Dauer fuer jede Strecke (kurze Wege liefen vorher
      // "gemuetlicher", lange Wege "hektischer" - bei gleicher Zeit fuer
      // unterschiedliche Distanz).
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const durationMs = Math.min(MAX_WALK_MS, Math.max(MIN_WALK_MS, distance / WALK_SPEED_PX_PER_MS));

      // Hinweg mit "pos" noch auf "from" mounten (kein Sprung beim ersten
      // Render), dann im naechsten Frame "pos" auf "to" umstellen - das
      // startet die CSS-left/top-Transition erst zu diesem Zeitpunkt, waehrend
      // "walking" schon true ist und es fuer die gesamte Gleitdauer bleibt
      // (vorher sprang "walking" auf false GENAU in dem Moment, in dem die
      // Transition ueberhaupt erst begann - daher froren Beine/Arme ein,
      // waehrend sich die Figur noch sichtbar bewegte).
      setWalkers((prev) => {
        const copy = new Map(prev);
        copy.set(agentId, { agentId, color: pick.color, destination, slotIndex, from, to, pos: from, durationMs, walking: true, atDestination: false });
        return copy;
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateWalker(agentId, (w) => ({ ...w, pos: w.to }));
        });
      });

      // Aufenthalt am Ziel bewusst lang & unterschiedlich (6-20s) statt eines
      // festen, kurzen ~2.8s-Fensters - wie lange genau ist laut Nutzer egal,
      // Hauptsache nicht mechanisch kurz.
      const stayMs = 6000 + Math.random() * 14000;
      schedule(() => updateWalker(agentId, (w) => ({ ...w, walking: false, atDestination: true })), durationMs);
      schedule(() => updateWalker(agentId, (w) => ({ ...w, pos: w.from, walking: true, atDestination: false })), durationMs + stayMs);
      schedule(() => updateWalker(agentId, () => null), durationMs + stayMs + durationMs);
    }, 2200);

    return () => {
      clearInterval(interval);
      pendingTimeouts.forEach(clearTimeout);
    };
  }, []);

  const activeWalkers = Array.from(walkers.values());
  const awayAgentIds = new Set(activeWalkers.map((w) => w.agentId));
  const fridgeOpen = activeWalkers.some((w) => w.destination === "fridge" && w.atDestination);

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
      {/* Fenster mit driftenden Wolken - ab 150px Breite je Fenster erst ab
          "sm" ueberlappungsfrei darstellbar; auf schmalen Handy-Breiten
          (< 600px) wuerden sich beide Fenster sichtbar ueberlappen, daher
          hier (wie Whiteboard/Projektor-Leinwand weiter unten) auf "xs"
          ausgeblendet statt kaputt uebereinander gequetscht. */}
      {[52, "calc(100% - 202px)"].map((left, i) => (
        <Box key={i} sx={{ position: "absolute", top: 16, left, width: 150, height: 105, borderRadius: 1, border: "6px solid #fff", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", overflow: "hidden", background: "linear-gradient(180deg,#bfe0f5,#e8f4fb)", display: { xs: "none", sm: "block" } }}>
          <Box sx={{ position: "absolute", inset: 0, "&::before, &::after": { content: '""', position: "absolute", backgroundColor: "#fff", zIndex: 1 }, "&::before": { top: 0, bottom: 0, left: "50%", width: 5, transform: "translateX(-50%)" }, "&::after": { left: 0, right: 0, top: "50%", height: 5, transform: "translateY(-50%)" } }} />
          <Box sx={{ position: "absolute", top: 18, left: -50, width: 32, height: 12, borderRadius: 6, backgroundColor: "#fff", opacity: 0.85, animation: `office-cloud-drift 14s linear infinite`, animationDelay: `${i * 4}s`, "@keyframes office-cloud-drift": { from: { transform: "translateX(0)" }, to: { transform: "translateX(270px)" } } }} />
          <Box sx={{ position: "absolute", top: 50, left: -85, width: 25, height: 10, borderRadius: 5, backgroundColor: "#fff", opacity: 0.7, animation: `office-cloud-drift 20s linear infinite`, animationDelay: `${i * 6}s` }} />
        </Box>
      ))}

      {/* Haengelampe mit sanftem Glimmen - auf "xs" mit ausgeblendet, da sie
          bewusst mittig zwischen Whiteboard und Leinwand positioniert ist
          (beide nur ab "sm" sichtbar) und ohne die beiden allein unzentriert
          wirken wuerde. */}
      <Box sx={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-95px)", width: 2, height: 30, backgroundColor: "#c9b896", display: { xs: "none", sm: "block" } }} />
      <Box
        sx={{
          position: "absolute",
          top: 28,
          left: "50%",
          transform: "translateX(-116px)",
          width: 42,
          height: 20,
          borderRadius: "50% 50% 0 0",
          backgroundColor: "#f0e4c8",
          border: "1px solid #c9b896",
          boxShadow: "0 0 24px 6px rgba(255,224,150,0.35)",
          animation: "office-lamp-glow 3s ease-in-out infinite",
          display: { xs: "none", sm: "block" },
          "@keyframes office-lamp-glow": { "0%,100%": { boxShadow: "0 0 24px 6px rgba(255,224,150,0.25)" }, "50%": { boxShadow: "0 0 30px 10px rgba(255,224,150,0.5)" } },
        }}
      />

      {/* Whiteboard mit Klebezetteln + Trendlinie statt Regal (Video-Referenz)
          - rein dekorativ/abstrakt, keine erfundenen Zahlen oder Texte. */}
      <Box sx={{ position: "absolute", top: 20, left: "50%", transform: "translateX(-190px)", display: { xs: "none", md: "block" } }}>
        <Box sx={{ width: 76, height: 4, mx: "auto", backgroundColor: "#c9b896", borderRadius: 1 }} />
        <Box sx={{ width: 92, height: 58, mt: "2px", borderRadius: 1, backgroundColor: "#fdfbf6", border: "3px solid #e4d5ba", boxShadow: "0 3px 8px rgba(0,0,0,0.1)", position: "relative", p: 0.75 }}>
          <Box sx={{ display: "flex", gap: "3px" }}>
            {["#f4e07a", "#f2938c", "#8fd19e", "#8fb8e8"].map((c) => (
              <Box key={c} sx={{ width: 14, height: 12, backgroundColor: c, borderRadius: "1px", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
            ))}
          </Box>
          <Box component="svg" viewBox="0 0 84 24" sx={{ position: "absolute", bottom: 4, left: 4, width: 84, height: 24 }}>
            <polyline points="0,20 14,14 28,17 42,8 56,11 70,3 84,6" fill="none" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </Box>
        </Box>
      </Box>

      {/* Projektor-Leinwand mit dem echten, vom Nutzer bereitgestellten Logo
          (frontend/public/bayar-solutions-logo.png) statt eines erfundenen
          oder reinen Text-Wordmarks. */}
      <Box sx={{ position: "absolute", top: 18, left: "50%", transform: "translateX(20px)", display: { xs: "none", md: "block" } }}>
        <Box sx={{ width: 3, height: 10, mx: "auto", backgroundColor: "#8a8a8a" }} />
        <Box sx={{ width: 8, height: 5, mx: "auto", borderRadius: 1, backgroundColor: "#3a3a3a" }} />
        <Box
          sx={{
            mt: 1,
            width: 168,
            height: 100,
            borderRadius: "3px",
            backgroundColor: "#ffffff",
            border: "4px solid #efe6d8",
            boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "office-screen-flicker 5s ease-in-out infinite",
            "@keyframes office-screen-flicker": { "0%,96%,100%": { opacity: 1 }, "97%": { opacity: 0.85 } },
          }}
        >
          {/* Bild ist bereits eng auf Logo+Schriftzug zugeschnitten (kein
              erkennbarer Weiss-Rand mehr) und fuellt die Leinwand randlos -
              kein Padding/Objekt-Versatz, der einen zweiten helleren Rand
              gegen den Leinwand-Hintergrund erzeugen wuerde.
              VITE_BASE_PATH-Praefix noetig: anders als Vite-Asset-Importe
              wird ein roher src="/..."-String NICHT automatisch von der
              "base"-Konfiguration umgeschrieben - ohne den Praefix zeigt das
              Bild bei einem Unterpfad-Deployment (z.B. /office) auf die
              falsche URL (Domain-Root statt /office/...), war live deshalb
              kaputt, lokal (Root-Deployment) aber unsichtbar unauffaellig. */}
          <Box component="img" src={`${import.meta.env.VITE_BASE_PATH || ""}/bayar-solutions-logo.png`} alt="Bayar Solutions" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
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

      {/* Boden mit Abteilungen - offener Raum ohne Karten-Kaesten (Video-
          Referenz), nur Ueberschrift + Abstand gliedern die Bereiche. */}
      <Box sx={{ position: "relative", mt: { xs: "56px", sm: "150px" }, pb: 3, px: { xs: 2, sm: 4 } }}>
        <Box sx={{ mb: 1 }}>
          <Box sx={{ fontSize: "0.8rem", fontWeight: 800, color: "#4a3d2a", mb: 1.5, pl: 0.5 }}>🏠 Meine Projekte</Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <OfficeZone title="Apps" agents={ownApps} accentColor="#3b82f6" awayAgentIds={awayAgentIds} onSelectAgent={onSelectAgent} registerDeskRef={registerDeskRef} emptyLabel="Keine aktiven Automation Rules für App-Projekte" />
            <OfficeZone title="Webseiten" agents={ownWebsites} accentColor="#14b8a6" awayAgentIds={awayAgentIds} onSelectAgent={onSelectAgent} registerDeskRef={registerDeskRef} emptyLabel="Keine aktiven Automation Rules für Webseiten-Projekte" />
          </Box>
        </Box>

        <Box sx={{ mt: 3 }}>
          <Box sx={{ fontSize: "0.8rem", fontWeight: 800, color: "#4a3d2a", mb: 1.5, pl: 0.5 }}>💼 Kundenprojekte</Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <OfficeZone title="Apps" agents={[]} accentColor="#9ca3af" awayAgentIds={awayAgentIds} onSelectAgent={onSelectAgent} registerDeskRef={registerDeskRef} emptyLabel="Noch keine Kundenprojekte hinterlegt" />
            <OfficeZone title="Webseiten" agents={[]} accentColor="#9ca3af" awayAgentIds={awayAgentIds} onSelectAgent={onSelectAgent} registerDeskRef={registerDeskRef} emptyLabel="Noch keine Kundenprojekte hinterlegt" />
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 5, mt: 4 }}>
          <OfficeKitchen coffeeRef={registerCoffeeRef} fridgeRef={registerFridgeRef} fridgeOpen={fridgeOpen} />
          <OfficeChillArea registerBedRef={registerBedRef} />
          <OfficeReadingCorner registerSeatRef={registerSeatRef} />
        </Box>
      </Box>

      {/* Die laufenden Charaktere - echte, gemessene Start-/Zielposition, mit
          echtem Gang-Zyklus waehrend der Bewegung (konstante Geschwindigkeit:
          Transition-Dauer aus der echten Distanz berechnet). Mehrere koennen
          gleichzeitig unterwegs sein. Am Ziel angekommen haelt die Person
          kurz das zum Ziel passende Item (Kaffee/Snack aus dem
          Kuehlschrank), legt sich in der Chill Area tatsaechlich auf ihr
          Bett, oder setzt sich in der Leseecke auf die Couch und liest -
          das Zzz gibt es ausschliesslich beim Liegen, nicht beim
          Stehen/Laufen/Sitzen. */}
      {activeWalkers.map((walker) => {
        if (walker.atDestination && walker.destination === "chill") {
          return (
            <Box key={walker.agentId} sx={{ position: "absolute", left: walker.pos.x, top: walker.pos.y, transform: "translate(-52%, -30px)", transition: `left ${walker.durationMs}ms ease-in-out, top ${walker.durationMs}ms ease-in-out`, zIndex: 5, pointerEvents: "none" }}>
              <OfficeLyingCharacter color={walker.color} />
            </Box>
          );
        }
        if (walker.atDestination && walker.destination === "books") {
          return (
            <Box key={walker.agentId} sx={{ position: "absolute", left: walker.pos.x, top: walker.pos.y, transform: "translate(-50%, -34px)", transition: `left ${walker.durationMs}ms ease-in-out, top ${walker.durationMs}ms ease-in-out`, zIndex: 5, pointerEvents: "none" }}>
              <OfficeSittingCharacter color={walker.color} />
            </Box>
          );
        }
        return (
          <Box key={walker.agentId} sx={{ position: "absolute", left: walker.pos.x, top: walker.pos.y, transform: "translate(-50%, -100%)", transition: `left ${walker.durationMs}ms ease-in-out, top ${walker.durationMs}ms ease-in-out`, zIndex: 5, pointerEvents: "none" }}>
            {walker.atDestination && DESTINATION_ITEM[walker.destination] ? (
              <Box sx={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", fontSize: 18 }}>{DESTINATION_ITEM[walker.destination]}</Box>
            ) : null}
            <OfficeCharacter status="IDLE" walking={walker.walking} color={walker.color} label="Pause" onClick={() => undefined} tooltip="Pause" />
          </Box>
        );
      })}
    </Box>
  );
});
