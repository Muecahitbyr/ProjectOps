import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "../common/EmptyState";
import type { HistoryBucket } from "../../types/analytics.types";

type NumericBucketKey = "healthScore" | "avgResponseTimeMs" | "incidentCount" | "errorRate" | "availability";

interface HistoryMetricChartProps {
  buckets: HistoryBucket[];
  metricKey: NumericBucketKey;
  color: string;
  unit?: string;
  variant?: "line" | "bar";
  height?: number;
  onBucketClick?: (bucket: HistoryBucket) => void;
}

// healthScore/errorRate/availability sind immer 0-100 - eine feste Domain
// verhindert, dass Recharts bei durchgehend 0 (z.B. ein Projekt mit 100%
// Fehlerrate im gesamten Zeitraum) automatisch auf eine winzige, irrefuehrende
// Skala wie [0, 4] zoomt. avgResponseTimeMs/incidentCount behalten die
// automatische Skala, da ihre Wertebereiche stark variieren.
const FIXED_DOMAIN_METRICS: ReadonlySet<NumericBucketKey> = new Set(["healthScore", "errorRate", "availability"]);

function formatAxisTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface TooltipEntry {
  payload: HistoryBucket;
}

function ChartTooltip({
  active,
  payload,
  metricKey,
  unit,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  metricKey: NumericBucketKey;
  unit?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]?.payload;
  if (!bucket) return null;
  const value = bucket[metricKey];

  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.25 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {new Date(bucket.bucketStart).toLocaleString()}
      </Typography>
      <Typography variant="body2">
        {value === null ? "no data" : `${value}${unit ?? ""}`}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {bucket.sampleCount} samples
      </Typography>
    </Box>
  );
}

// Ein einziges konfigurierbares Chart fuer alle 5 im Auftrag geforderten
// Verlaufsarten (Health Score/Response Time/Incidents/Error Rate/
// Availability) - vermeidet 5 fast identische Chart-Komponenten. Ein Klick
// auf einen Datenpunkt oeffnet den Drill-Down-Dialog fuer dieses
// Zeit-Bucket (siehe ProjectHistoryCharts.tsx).
export function HistoryMetricChart({
  buckets,
  metricKey,
  color,
  unit,
  variant = "line",
  height = 220,
  onBucketClick,
}: HistoryMetricChartProps) {
  const theme = useTheme();

  if (buckets.length === 0) {
    return <EmptyState message="No data for this period yet." minHeight={height} />;
  }

  // Recharts v3 liefert im Klick-Handler nur noch activeLabel (den
  // XAxis-dataKey-Wert des angeklickten Punkts), kein activePayload mehr -
  // darueber wird das passende Bucket-Objekt nachgeschlagen.
  const handleClick = onBucketClick
    ? ({ activeLabel }: { activeLabel?: string | number }) => {
        const bucket = buckets.find((entry) => entry.bucketStart === activeLabel);
        if (bucket) onBucketClick(bucket);
      }
    : undefined;

  return (
    <Box sx={{ width: "100%", height, cursor: onBucketClick ? "pointer" : "default" }}>
      <ResponsiveContainer width="100%" height="100%">
        {variant === "bar" ? (
          <BarChart data={buckets} margin={{ top: 8, right: 16, bottom: 0, left: -12 }} onClick={handleClick}>
            <CartesianGrid stroke={theme.palette.divider} vertical={false} />
            <XAxis dataKey="bucketStart" tickFormatter={formatAxisTime} stroke={theme.palette.text.secondary} fontSize={11} minTickGap={40} />
            <YAxis stroke={theme.palette.text.secondary} fontSize={12} width={40} allowDecimals={false} />
            <Tooltip content={<ChartTooltip metricKey={metricKey} unit={unit} />} />
            <Bar dataKey={metricKey} fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        ) : (
          <LineChart data={buckets} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} onClick={handleClick}>
            <CartesianGrid stroke={theme.palette.divider} vertical={false} />
            <XAxis dataKey="bucketStart" tickFormatter={formatAxisTime} stroke={theme.palette.text.secondary} fontSize={11} minTickGap={40} />
            <YAxis
              stroke={theme.palette.text.secondary}
              fontSize={12}
              width={44}
              unit={unit}
              domain={FIXED_DOMAIN_METRICS.has(metricKey) ? [0, 100] : ["auto", "auto"]}
            />
            <Tooltip content={<ChartTooltip metricKey={metricKey} unit={unit} />} />
            <Line
              type="monotone"
              dataKey={metricKey}
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </Box>
  );
}
