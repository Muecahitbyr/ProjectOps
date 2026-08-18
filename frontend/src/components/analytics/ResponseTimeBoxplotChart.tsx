import { useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Bar, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../common/EmptyState";
import type { HistoryBucket } from "../../types/analytics.types";

interface ResponseTimeBoxplotChartProps {
  buckets: HistoryBucket[];
  height?: number;
}

interface BoxplotDatum {
  bucketStart: string;
  base: number | null;
  iqr: number | null;
  minResponseTimeMs: number | null;
  maxResponseTimeMs: number | null;
  avgResponseTimeMs: number | null;
  sampleCount: number;
}

// Boxplot-aehnliche Darstellung ohne zusaetzliche Bibliothek (Recharts
// ComposedChart, siehe Auftrag): ein unsichtbarer "base"-Balken (bis P25)
// traegt einen sichtbaren "iqr"-Balken (P25-P75, die eigentliche Box) im
// selben Stack; Min/Max als duenne Linien (Whiskers), Avg als hervorgehobene
// Linie (Mittelwert je Bucket - kein echter Median, da PERCENTILE_CONT nur
// P25/P75 pro Bucket liefert, nicht den Median selbst; siehe
// ResponseTimeAnalytics-Seite fuer den echten Median/P50-Wert insgesamt).
function toBoxplotDatum(bucket: HistoryBucket): BoxplotDatum {
  const hasRange = bucket.p25ResponseTimeMs !== null && bucket.p75ResponseTimeMs !== null;
  return {
    bucketStart: bucket.bucketStart,
    base: hasRange ? bucket.p25ResponseTimeMs : null,
    iqr: hasRange ? Math.max(0, bucket.p75ResponseTimeMs! - bucket.p25ResponseTimeMs!) : null,
    minResponseTimeMs: bucket.minResponseTimeMs,
    maxResponseTimeMs: bucket.maxResponseTimeMs,
    avgResponseTimeMs: bucket.avgResponseTimeMs,
    sampleCount: bucket.sampleCount,
  };
}

function formatAxisTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface TooltipEntry {
  payload: BoxplotDatum;
}

function BoxplotTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point || point.sampleCount === 0) return null;

  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.25 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {new Date(point.bucketStart).toLocaleString()}
      </Typography>
      <Typography variant="body2">Min {point.minResponseTimeMs}ms · Max {point.maxResponseTimeMs}ms</Typography>
      <Typography variant="body2">
        P25 {point.base}ms · P75 {point.base !== null && point.iqr !== null ? point.base + point.iqr : "-"}ms
      </Typography>
      <Typography variant="body2">Avg {point.avgResponseTimeMs}ms</Typography>
    </Box>
  );
}

export function ResponseTimeBoxplotChart({ buckets, height = 260 }: ResponseTimeBoxplotChartProps) {
  const theme = useTheme();
  const data = useMemo(() => buckets.map(toBoxplotDatum), [buckets]);

  if (data.length === 0 || data.every((point) => point.sampleCount === 0)) {
    return <EmptyState message="No response time data for this period." minHeight={height} />;
  }

  return (
    <Box sx={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="bucketStart" tickFormatter={formatAxisTime} stroke={theme.palette.text.secondary} fontSize={11} minTickGap={40} />
          <YAxis stroke={theme.palette.text.secondary} fontSize={12} width={48} unit="ms" />
          <Tooltip content={<BoxplotTooltip />} />
          <Bar dataKey="base" stackId="box" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="iqr" stackId="box" fill={theme.palette.primary.main} fillOpacity={0.35} isAnimationActive={false} />
          <Line type="monotone" dataKey="minResponseTimeMs" stroke={theme.palette.text.disabled} strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="maxResponseTimeMs" stroke={theme.palette.text.disabled} strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="avgResponseTimeMs" stroke={theme.palette.primary.main} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  );
}
