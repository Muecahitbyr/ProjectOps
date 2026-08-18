import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../common/EmptyState";
import type { WeekdayEntry } from "../../types/analytics.types";

interface WeekdayChartProps {
  entries: WeekdayEntry[];
  height?: number;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeekdayChart({ entries, height = 220 }: WeekdayChartProps) {
  const theme = useTheme();

  if (entries.every((entry) => entry.count === 0)) {
    return <EmptyState message="No incident data yet." minHeight={height} />;
  }

  const data = entries.map((entry) => ({ ...entry, label: WEEKDAY_LABELS[entry.weekday] ?? String(entry.weekday) }));

  return (
    <Box sx={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="label" stroke={theme.palette.text.secondary} fontSize={12} />
          <YAxis stroke={theme.palette.text.secondary} fontSize={12} width={32} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}` }}
          />
          <Bar dataKey="count" fill={theme.palette.primary.main} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
