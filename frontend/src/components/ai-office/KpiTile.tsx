import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import { StatsCard } from "../dashboard/StatsCard";

interface KpiTileProps {
  label: string;
  value: number | string;
  icon?: ReactNode;
  accentColor?: string;
}

const PULSE_DURATION_MS = 700;

// Erkennt einen ECHTEN Wertwechsel zwischen zwei Renders (z.B. nach einer
// Realtime-Invalidierung kam ein neuer Live-Wert vom Backend) - beim ersten
// Rendern (Erstladen) wird bewusst NICHT gepulst, das waere kein "Wechsel".
function useValueChangedPulse(value: number | string): boolean {
  const previous = useRef(value);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (previous.current === value) return undefined;
    previous.current = value;
    setPulsing(true);
    const timer = setTimeout(() => setPulsing(false), PULSE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return pulsing;
}

// Phase 2 "AI Operations Office Polish" - eine KPI-Kachel blitzt kurz auf,
// wenn sich ihr Wert seit dem letzten Render tatsaechlich geaendert hat
// (echte Datenaenderung, z.B. ein neuer offener Incident) - macht sichtbar,
// dass die Zahlen live sind, ohne eine Dauer-Animation zu erzwingen.
export const KpiTile = memo(function KpiTile({ label, value, icon, accentColor }: KpiTileProps) {
  const pulsing = useValueChangedPulse(value);
  return (
    <Box
      sx={{
        height: "100%",
        borderRadius: 2,
        transition: "box-shadow 0.3s ease",
        boxShadow: pulsing ? `0 0 0 1px ${accentColor ?? "#3b82f6"}88` : "none",
      }}
    >
      <StatsCard label={label} value={value} icon={icon} accentColor={accentColor} />
    </Box>
  );
});
