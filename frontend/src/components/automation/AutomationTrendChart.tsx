import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../common/EmptyState";
import { healthStatusColors } from "../../theme/statusColors";
import type { AutomationTrendPoint } from "../../types/automation.types";

interface AutomationTrendChartProps {
  points: AutomationTrendPoint[];
  height?: number;
}

// Teil 7 "Automation Trend" - taegliche Ausfuehrungszahlen (erfolgreich vs.
// fehlgeschlagen) der letzten Wochen.
export function AutomationTrendChart({ points, height = 220 }: AutomationTrendChartProps) {
  const theme = useTheme();

  if (points.length === 0) {
    return <EmptyState message="No automation executions yet." minHeight={height} />;
  }

  const data = points.map((point) => ({ ...point, label: new Date(point.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }));

  return (
    <Box sx={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="label" stroke={theme.palette.text.secondary} fontSize={12} />
          <YAxis stroke={theme.palette.text.secondary} fontSize={12} width={32} allowDecimals={false} />
          <Tooltip contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}` }} />
          <Line type="monotone" dataKey="success" name="Success" stroke={healthStatusColors.healthy} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="failed" name="Failed" stroke={healthStatusColors.critical} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
