import { memo } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import type { AgentStatus } from "./officeConfig";

interface OfficeCharacterProps {
  status: AgentStatus;
  color: string;
  label: string;
  tooltip: React.ReactNode;
  onClick: () => void;
}

// Ein einzelner, selbst per SVG gezeichneter (kein externes Asset/keine
// Sprite-Library noetig) menschlicher Buero-Charakter. Die Pose leitet sich
// ausschliesslich aus dem bereits vorhandenen, echten AgentStatus ab
// (officeConfig.ts#buildAgentSnapshots): IDLE -> schlaeft (nie ausgeloest),
// WAITING -> wartet mit Uhr-Icon, WORKING -> aktiv (Wippen), COMPLETED ->
// steht mit Haken, BLOCKED -> steht alarmiert zurueckgewichen (das
// eigentliche "kaputt"-Signal ist das brennende Schreibtisch-Overlay in
// OfficeFloorScene.tsx, nicht die Figur selbst). Keine erfundene Aktivitaet -
// ein Agent ohne jede Regel wird gar nicht erst gerendert.
export const OfficeCharacter = memo(function OfficeCharacter({ status, color, label, tooltip, onClick }: OfficeCharacterProps) {
  const isBlocked = status === "BLOCKED";
  const isWorking = status === "WORKING";
  const isIdle = status === "IDLE";
  const isWaiting = status === "WAITING";
  const isCompleted = status === "COMPLETED";

  return (
    <Tooltip title={tooltip} enterDelay={300} placement="top">
      <Box
        onClick={onClick}
        role="button"
        aria-label={label}
        sx={{
          position: "relative",
          width: 46,
          height: 64,
          cursor: "pointer",
          transition: "transform 0.15s ease",
          zIndex: 1,
          "&:hover": { transform: "translateY(-3px) scale(1.08)", zIndex: 2 },
        }}
      >
        {/* Bodenschatten - erzeugt die raeumliche "steht auf dem Boden"-Wirkung */}
        <Box
          sx={{
            position: "absolute",
            bottom: 2,
            left: "50%",
            transform: "translateX(-50%)",
            width: 26,
            height: 7,
            borderRadius: "50%",
            backgroundColor: "rgba(40,30,20,0.22)",
            filter: "blur(1.5px)",
          }}
        />

        <Box
          component="svg"
          viewBox="0 0 40 60"
          sx={{
            position: "absolute",
            left: "50%",
            bottom: 6,
            width: 40,
            height: 58,
            transform: isBlocked ? "translateX(-58%) rotate(-8deg)" : "translateX(-50%)",
            transformOrigin: "center bottom",
            transition: "transform 0.3s ease",
            animation: isWorking
              ? "office-char-bob 0.9s ease-in-out infinite"
              : isIdle
                ? "office-char-breathe 3s ease-in-out infinite"
                : isBlocked
                  ? "office-char-flinch 0.5s ease-in-out infinite"
                  : undefined,
            "@keyframes office-char-bob": {
              "0%, 100%": { transform: "translateX(-50%) translateY(0)" },
              "50%": { transform: "translateX(-50%) translateY(-2px)" },
            },
            "@keyframes office-char-breathe": {
              "0%, 100%": { transform: "translateX(-50%) scale(1)" },
              "50%": { transform: "translateX(-50%) scale(0.985)" },
            },
            "@keyframes office-char-flinch": {
              "0%, 100%": { transform: "translateX(-58%) rotate(-8deg)" },
              "50%": { transform: "translateX(-58%) rotate(-11deg)" },
            },
          }}
        >
          {/* Koerper */}
          <rect x="9" y="26" width="22" height="26" rx="9" fill={color} />
          {/* Kopf */}
          <circle cx="20" cy="13" r="10" fill="#f2c9a0" />
          {/* Haar */}
          <path d="M10 11 a10 10 0 0 1 20 0 v-1 a10 8 0 0 0 -20 0 z" fill="#3b2a1a" />
          {/* Augen: offen (wach) oder geschlossen (idle/schlafend) */}
          {isIdle ? (
            <>
              <line x1="15" y1="14" x2="18" y2="14" stroke="#3b2a1a" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="22" y1="14" x2="25" y2="14" stroke="#3b2a1a" strokeWidth="1.4" strokeLinecap="round" />
            </>
          ) : isBlocked ? (
            <>
              <path d="M14.5 12.5 L18.5 15" stroke="#3b2a1a" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M25.5 12.5 L21.5 15" stroke="#3b2a1a" strokeWidth="1.4" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle cx="16.5" cy="13.5" r="1.3" fill="#2a2a2a" />
              <circle cx="23.5" cy="13.5" r="1.3" fill="#2a2a2a" />
            </>
          )}
          {/* Arme */}
          <rect x="4" y="28" width="6" height="16" rx="3" fill={color} opacity={0.85} />
          <rect x="30" y="28" width="6" height="16" rx="3" fill={color} opacity={0.85} />
          {/* Beine */}
          <rect x="12" y="50" width="6" height="9" rx="2.5" fill="#2d2f36" />
          <rect x="22" y="50" width="6" height="9" rx="2.5" fill="#2d2f36" />
        </Box>

        {/* Zustands-Badge oberhalb der Figur */}
        {isIdle ? (
          <Box sx={{ position: "absolute", top: -6, right: -2, fontSize: 13, animation: "office-char-zzz 2.4s ease-in-out infinite", "@keyframes office-char-zzz": { "0%,100%": { opacity: 0.3, transform: "translateY(0)" }, "50%": { opacity: 1, transform: "translateY(-3px)" } } }}>
            💤
          </Box>
        ) : isWaiting ? (
          <Box sx={{ position: "absolute", top: -8, right: -2, fontSize: 13 }}>⏳</Box>
        ) : isCompleted ? (
          <Box sx={{ position: "absolute", top: -8, right: -2, fontSize: 13 }}>✅</Box>
        ) : null}
      </Box>
    </Tooltip>
  );
});
