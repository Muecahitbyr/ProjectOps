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

// Ein einzelner, per SVG selbst gezeichneter (kein externes Asset/keine
// Sprite-Library noetig) menschlicher Buero-Charakter - keine abstrakten
// Punkte/Icons. Die Pose leitet sich ausschliesslich aus dem bereits
// vorhandenen, echten AgentStatus ab (officeConfig.ts#buildAgentSnapshots):
// IDLE -> "schlaeft" (geschlossene Augen, Zzz - kein Trigger seit je), WAITING
// -> wartet mit Uhr-Icon, WORKING -> aktiv am Schreibtisch (Wippen), BLOCKED
// -> liegt am Boden mit Warn-Icon (echtes Problem: Regel abgelehnt/Ausfuehrung
// fehlgeschlagen), COMPLETED -> steht mit Haken. Keine erfundene Aktivitaet -
// ein Agent ohne jede Regel wird gar nicht erst gerendert (siehe OfficeFloorScene).
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
          "&:hover": { transform: "translateY(-3px) scale(1.06)" },
        }}
      >
        {/* Bodenschatten - erzeugt die raeumliche "steht auf dem Boden"-Wirkung */}
        <Box
          sx={{
            position: "absolute",
            bottom: isBlocked ? 6 : 2,
            left: "50%",
            transform: "translateX(-50%)",
            width: isBlocked ? 42 : 26,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "rgba(0,0,0,0.28)",
            filter: "blur(1.5px)",
          }}
        />

        <Box
          component="svg"
          viewBox="0 0 40 60"
          sx={{
            position: "absolute",
            left: "50%",
            bottom: isBlocked ? 4 : 6,
            width: 40,
            height: 58,
            transform: isBlocked ? "translateX(-50%) rotate(90deg) translateY(6px)" : "translateX(-50%)",
            transformOrigin: "center bottom",
            transition: "transform 0.4s ease",
            opacity: isBlocked ? 0.85 : 1,
            animation: isWorking
              ? "office-char-bob 0.9s ease-in-out infinite"
              : isIdle
                ? "office-char-breathe 3s ease-in-out infinite"
                : undefined,
            "@keyframes office-char-bob": {
              "0%, 100%": { transform: "translateX(-50%) translateY(0)" },
              "50%": { transform: "translateX(-50%) translateY(-2px)" },
            },
            "@keyframes office-char-breathe": {
              "0%, 100%": { transform: "translateX(-50%) scale(1)" },
              "50%": { transform: "translateX(-50%) scale(0.985)" },
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
        ) : isBlocked ? (
          <Box sx={{ position: "absolute", top: 2, right: -6, fontSize: 15, animation: "office-char-alert 1s ease-in-out infinite", "@keyframes office-char-alert": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.35 } } }}>
            ⚠️
          </Box>
        ) : isCompleted ? (
          <Box sx={{ position: "absolute", top: -8, right: -2, fontSize: 13 }}>✅</Box>
        ) : null}
      </Box>
    </Tooltip>
  );
});
