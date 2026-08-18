import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../common/EmptyState";
import { healthStatusColors } from "../../theme/statusColors";
import type { ApiUsageTimeseriesBucket } from "../../types/api-usage.types";

function formatAxisTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface TooltipEntry {
  payload: ApiUsageTimeseriesBucket;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]?.payload;
  if (!bucket) return null;
  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.25 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {new Date(bucket.timestamp).toLocaleString()}
      </Typography>
      <Typography variant="body2">{bucket.requests} requests</Typography>
      <Typography variant="body2" sx={{ color: healthStatusColors.critical }}>
        {bucket.errors} errors
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {bucket.avgLatency === null ? "no latency data" : `${bucket.avgLatency}ms avg`}
      </Typography>
    </Box>
  );
}

// Phase 19 Auftragspunkt 4 "Frontend" ("Requests Verlauf"/"Fehler Verlauf")
// - ein einziges Chart mit beiden Linien statt zwei fast identischer
// Komponenten, dasselbe Wiederverwendungsprinzip wie HistoryMetricChart.tsx
// (analytics-Bereich).
export function ApiUsageTimeseriesChart({ buckets, height = 260 }: { buckets: ApiUsageTimeseriesBucket[]; height?: number }) {
  const theme = useTheme();

  if (buckets.length === 0) {
    return <EmptyState message="No usage recorded in this period yet." minHeight={height} />;
  }

  return (
    <Box sx={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={buckets} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="timestamp" tickFormatter={formatAxisTime} stroke={theme.palette.text.secondary} fontSize={11} minTickGap={40} />
          <YAxis stroke={theme.palette.text.secondary} fontSize={12} width={44} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="requests"
            name="Requests"
            stroke={theme.palette.primary.main}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="errors"
            name="Errors"
            stroke={healthStatusColors.critical}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
