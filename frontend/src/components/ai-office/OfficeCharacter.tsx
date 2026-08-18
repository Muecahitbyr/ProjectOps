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
  // "walking" ueberschreibt die statusbasierte Pose mit einem echten
  // Gang-Zyklus (Beine/Arme wechselseitig rotiert) - genutzt vom
  // Kaffeepause-/Kuehlschrank-Laufweg in OfficeFloorScene.tsx.
  walking?: boolean;
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
export const OfficeCharacter = memo(function OfficeCharacter({ status, color, label, tooltip, onClick, walking }: OfficeCharacterProps) {
  const isBlocked = !walking && status === "BLOCKED";
  const isWorking = !walking && status === "WORKING";
  const isIdle = !walking && status === "IDLE";
  const isWaiting = !walking && status === "WAITING";
  const isCompleted = !walking && status === "COMPLETED";
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
          width: 44,
          height: 60,
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
            width: 24,
            height: 6,
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
            bottom: 4,
            width: 38,
            height: 56,
            transform: isBlocked ? "translateX(-58%) rotate(-7deg)" : "translateX(-50%)",
            transformOrigin: "center bottom",
            transition: "transform 0.3s ease",
            animation: walking
              ? "office-char-walk-bob 0.4s ease-in-out infinite"
              : isWorking
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
            "@keyframes office-char-walk-bob": {
              "0%, 100%": { transform: "translateX(-50%) translateY(0)" },
              "50%": { transform: "translateX(-50%) translateY(-2px)" },
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
          {/* Echter Gang-Zyklus: Beine/Arme wechselseitig um die Hueft-/
              Schulterachse rotiert (kein Gleiten - die Glieder bewegen sich). */}
          {walking ? (
            <style>{`
              @keyframes office-leg-fwd { 0%,100% { transform: rotate(24deg); } 50% { transform: rotate(-24deg); } }
              @keyframes office-leg-back { 0%,100% { transform: rotate(-24deg); } 50% { transform: rotate(24deg); } }
              @keyframes office-arm-fwd { 0%,100% { transform: rotate(-20deg); } 50% { transform: rotate(20deg); } }
              @keyframes office-arm-back { 0%,100% { transform: rotate(20deg); } 50% { transform: rotate(-20deg); } }
            `}</style>
          ) : null}
          {/* Beine */}
          <rect x="16" y="58" width="8" height="16" rx="3" fill="#37414f" style={walking ? { transformOrigin: "20px 58px", animation: "office-leg-fwd 0.4s ease-in-out infinite" } : undefined} />
          <rect x="28" y="58" width="8" height="16" rx="3" fill="#2b333f" style={walking ? { transformOrigin: "32px 58px", animation: "office-leg-back 0.4s ease-in-out infinite" } : undefined} />
          {/* Schuhe */}
          <rect x="14.5" y="72" width="10" height="5" rx="2" fill="#1c2128" style={walking ? { transformOrigin: "20px 58px", animation: "office-leg-fwd 0.4s ease-in-out infinite" } : undefined} />
          <rect x="26.5" y="72" width="10" height="5" rx="2" fill="#1c2128" style={walking ? { transformOrigin: "32px 58px", animation: "office-leg-back 0.4s ease-in-out infinite" } : undefined} />
          {/* Koerper: schlichter, blockiger Torso statt Pullover-Silhouette -
              Video-Referenz zeigt eine einfache, low-poly "Chibi"-Figur ohne
              Kragen/Taille, kein sichtbarer Hals (Kopf sitzt direkt auf den
              Schultern). */}
          <rect x="12" y="28" width="28" height="30" rx="9" fill={color} />
          {/* Arme */}
          <rect x="4" y="30" width="9" height="24" rx="4.5" fill={color} style={walking ? { transformOrigin: "8.5px 31px", animation: "office-arm-back 0.4s ease-in-out infinite" } : undefined} />
          <rect x="39" y="30" width="9" height="24" rx="4.5" fill={color} style={walking ? { transformOrigin: "43.5px 31px", animation: "office-arm-fwd 0.4s ease-in-out infinite" } : undefined} />
          <circle cx="8.5" cy="54" r="4" fill={skin} />
          <circle cx="43.5" cy="54" r="4" fill={skin} />
          {/* Kopf: groesser/rundlicher (Chibi-Proportion) */}
          <circle cx="26" cy="17" r="15" fill={skin} />
          {/* Haare: nur die obere Kappe, damit darunter genug Gesicht frei
              bleibt (vorher deckte die Haar-Ellipse fast den ganzen Kopf ab -
              die Augen/der Mund waren dadurch praktisch unsichtbar). */}
          <ellipse cx="26" cy="8" rx="15" ry="7" fill={hair} />
          {/* Gesicht - Augen/Mund vergroessert, damit sie bei der kleinen
              Renderroesse noch klar erkennbar sind. */}
          {isIdle ? (
            <>
              <path d="M18 20 q3.5 -2.4 7 0" stroke="#3b2a1a" strokeWidth="2" fill="none" strokeLinecap="round" />
              <path d="M27 20 q3.5 -2.4 7 0" stroke="#3b2a1a" strokeWidth="2" fill="none" strokeLinecap="round" />
              <path d="M21 25.5 q5 2 10 0" stroke="#8a5a3b" strokeWidth="1.7" fill="none" strokeLinecap="round" />
            </>
          ) : isBlocked ? (
            <>
              <path d="M18 18 L24.5 21" stroke="#3b2a1a" strokeWidth="2" strokeLinecap="round" />
              <path d="M34 18 L27.5 21" stroke="#3b2a1a" strokeWidth="2" strokeLinecap="round" />
              <path d="M20.5 26.5 q5.5 -2.4 11 0" stroke="#8a3b2a" strokeWidth="2" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle cx="20" cy="19.5" r="2.3" fill="#241a10" />
              <circle cx="32" cy="19.5" r="2.3" fill="#241a10" />
              <path d={isCompleted || isWorking ? "M20.5 25.5 q5.5 3.4 11 0" : "M20.5 26 q5.5 1.6 11 0"} stroke="#8a5a3b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            </>
          )}
        </Box>

        {/* Zustands-Badge oberhalb der Figur - bewusst nur fuer die beiden
            Zustaende, die sich nicht schon an der Pose ablesen lassen
            (Schlafen/Warten). COMPLETED bekommt bewusst kein Extra-Icon mehr
            (fuehrte zu Verwirrung "was bedeutet das gruene Icon") - eine
            erfolgreich abgeschlossene Aufgabe sieht einfach wie normales
            wach/aufmerksames Stehen aus. */}
        {isIdle ? (
          <Box sx={{ position: "absolute", top: -2, right: 0, fontSize: 12, animation: "office-char-zzz 2.4s ease-in-out infinite", "@keyframes office-char-zzz": { "0%,100%": { opacity: 0.3, transform: "translateY(0)" }, "50%": { opacity: 1, transform: "translateY(-4px)" } } }}>
            💤
          </Box>
        ) : isWaiting ? (
          <Box sx={{ position: "absolute", top: -4, right: 0, fontSize: 12 }}>⏳</Box>
        ) : null}
      </Box>
    </Tooltip>
  );
});
