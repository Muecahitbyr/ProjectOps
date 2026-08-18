import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type DotProps,
} from "recharts";
import type { TimelinePoint } from "../../types/timeline.types";
import { checkStatusColor } from "../../theme/statusColors";
import { EmptyState } from "../common/EmptyState";

interface TimelineChartProps {
  points: TimelinePoint[];
  height?: number;
}

function formatAxisTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

interface TooltipPayloadEntry {
  payload: TimelinePoint;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.25 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {new Date(point.timestamp).toLocaleString()}
      </Typography>
      <Typography variant="body2">{point.checkId}</Typography>
      <Typography variant="body2" sx={{ color: checkStatusColor(point.status) }}>
        {point.status}
        {point.responseTimeMs !== null ? ` · ${point.responseTimeMs}ms` : ""}
      </Typography>
    </Box>
  );
}

// Farbiger Punkt pro Datenpunkt statt einer einzelnen Linienfarbe - macht
// den Status-Verlauf (nicht nur die Antwortzeit) auf einen Blick sichtbar.
function StatusDot(props: DotProps & { payload?: TimelinePoint }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) {
    return null;
  }
  return <circle cx={cx} cy={cy} r={3} fill={checkStatusColor(payload.status)} stroke="none" />;
}

export function TimelineChart({ points, height = 260 }: TimelineChartProps) {
  const theme = useTheme();

  if (points.length === 0) {
    return <EmptyState message="No timeline data for this period yet." minHeight={height} />;
  }

  return (
    <Box sx={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.palette.divider} vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatAxisTime}
            stroke={theme.palette.text.secondary}
            fontSize={12}
            minTickGap={40}
          />
          <YAxis
            stroke={theme.palette.text.secondary}
            fontSize={12}
            width={48}
            unit="ms"
            allowDecimals={false}
          />
          <Tooltip content={<ChartTooltip />} />
          <Line
            type="monotone"
            dataKey="responseTimeMs"
            stroke={theme.palette.primary.main}
            strokeWidth={1.5}
            dot={<StatusDot />}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
