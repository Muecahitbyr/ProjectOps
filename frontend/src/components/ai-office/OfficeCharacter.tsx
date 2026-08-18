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
// (officeConfig.ts#buildAgentSnapshots): IDLE -> schlaeft (ein normaler,
// ruhiger Zustand - kein Fehler, nur nichts zu tun), WAITING -> wartet mit
// Uhr-Icon, WORKING -> aktiv (Wippen + Tipp-Bewegung), COMPLETED -> steht mit
// Haken, BLOCKED -> steht alarmiert zurueckgewichen (das eigentliche
// "kaputt"-Signal ist der brennende Schreibtisch in OfficeFloorScene.tsx).
// Keine erfundene Aktivitaet - ein Agent ohne jede Regel wird gar nicht erst
// gerendert.
export const OfficeCharacter = memo(function OfficeCharacter({ status, color, label, tooltip, onClick }: OfficeCharacterProps) {
  const isBlocked = status === "BLOCKED";
  const isWorking = status === "WORKING";
  const isIdle = status === "IDLE";
  const isWaiting = status === "WAITING";
  const isCompleted = status === "COMPLETED";
  const skin = "#e8b48a";
  const hair = "#3b2a1a";

  return (
    <Tooltip title={tooltip} enterDelay={300} placement="top">
      <Box
        onClick={onClick}
        role="button"
        aria-label={label}
        sx={{
          position: "relative",
          width: 60,
          height: 82,
          cursor: "pointer",
          transition: "transform 0.15s ease",
          zIndex: 1,
          "&:hover": { transform: "translateY(-3px) scale(1.07)", zIndex: 2 },
        }}
      >
        {/* Bodenschatten */}
        <Box
          sx={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 32,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "rgba(40,30,20,0.22)",
            filter: "blur(1.5px)",
          }}
        />

        <Box
          component="svg"
          viewBox="0 0 52 78"
          sx={{
            position: "absolute",
            left: "50%",
            bottom: 6,
            width: 52,
            height: 76,
            transform: isBlocked ? "translateX(-58%) rotate(-7deg)" : "translateX(-50%)",
            transformOrigin: "center bottom",
            transition: "transform 0.3s ease",
            animation: isWorking
              ? "office-char-bob 0.9s ease-in-out infinite"
              : isIdle
                ? "office-char-breathe 3.2s ease-in-out infinite"
                : isBlocked
                  ? "office-char-flinch 0.5s ease-in-out infinite"
                  : undefined,
            "@keyframes office-char-bob": {
              "0%, 100%": { transform: "translateX(-50%) translateY(0) rotate(0deg)" },
              "50%": { transform: "translateX(-50%) translateY(-3px) rotate(-2deg)" },
            },
            "@keyframes office-char-breathe": {
              "0%, 100%": { transform: "translateX(-50%) scale(1)" },
              "50%": { transform: "translateX(-50%) scale(0.98)" },
            },
            "@keyframes office-char-flinch": {
              "0%, 100%": { transform: "translateX(-58%) rotate(-7deg)" },
              "50%": { transform: "translateX(-58%) rotate(-11deg)" },
            },
          }}
        >
          {/* Beine */}
          <rect x="16" y="58" width="8" height="16" rx="3" fill="#37414f" />
          <rect x="28" y="58" width="8" height="16" rx="3" fill="#2b333f" />
          {/* Schuhe */}
          <rect x="14.5" y="72" width="10" height="5" rx="2" fill="#1c2128" />
          <rect x="26.5" y="72" width="10" height="5" rx="2" fill="#1c2128" />
          {/* Koerper/Pullover */}
          <path d="M13 34 Q13 26 26 26 Q39 26 39 34 L40 62 Q26 66 12 62 Z" fill={color} />
          {/* Kragen */}
          <path d="M20 27 L26 33 L32 27" stroke="#ffffff55" strokeWidth="2" fill="none" strokeLinecap="round" />
          {/* Arme */}
          <rect x="5" y="33" width="9" height="22" rx="4.5" fill={color} />
          <rect x="38" y="33" width="9" height="22" rx="4.5" fill={color} />
          <circle cx="9.5" cy="54" r="4" fill={skin} />
          <circle cx="42.5" cy="54" r="4" fill={skin} />
          {/* Hals */}
          <rect x="22" y="20" width="8" height="8" fill={skin} />
          {/* Kopf */}
          <circle cx="26" cy="14" r="13" fill={skin} />
          {/* Ohren */}
          <circle cx="13.5" cy="14" r="2.4" fill={skin} />
          <circle cx="38.5" cy="14" r="2.4" fill={skin} />
          {/* Haare */}
          <path d="M13 13 a13 13 0 0 1 26 0 v-1.5 Q26 -1 13 11.5 Z" fill={hair} />
          <path d="M13 13 Q13 3 26 3 Q39 3 39 13 L38 9 Q26 4 14 9 Z" fill={hair} />
          {/* Gesicht */}
          {isIdle ? (
            <>
              <path d="M19 15 q3 -2.4 6 0" stroke="#3b2a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              <path d="M29 15 q3 -2.4 6 0" stroke="#3b2a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              <path d="M22 21 q4 2 8 0" stroke="#8a5a3b" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            </>
          ) : isBlocked ? (
            <>
              <path d="M19 13.5 L25 16.5" stroke="#3b2a1a" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M33 13.5 L27 16.5" stroke="#3b2a1a" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M21 22 q5 -2.5 10 0" stroke="#8a3b2a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle cx="21.5" cy="14.5" r="1.6" fill="#241a10" />
              <circle cx="30.5" cy="14.5" r="1.6" fill="#241a10" />
              <path d={isCompleted || isWorking ? "M21 20 q5 3.2 10 0" : "M21 21 q5 1.6 10 0"} stroke="#8a5a3b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </>
          )}
        </Box>

        {/* Zustands-Badge oberhalb der Figur */}
        {isIdle ? (
          <Box sx={{ position: "absolute", top: -4, right: 2, fontSize: 15, animation: "office-char-zzz 2.4s ease-in-out infinite", "@keyframes office-char-zzz": { "0%,100%": { opacity: 0.3, transform: "translateY(0)" }, "50%": { opacity: 1, transform: "translateY(-4px)" } } }}>
            💤
          </Box>
        ) : isWaiting ? (
          <Box sx={{ position: "absolute", top: -6, right: 2, fontSize: 15 }}>⏳</Box>
        ) : isCompleted ? (
          <Box sx={{ position: "absolute", top: -6, right: 2, fontSize: 15 }}>✅</Box>
        ) : null}
      </Box>
    </Tooltip>
  );
});
