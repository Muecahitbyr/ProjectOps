import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../common/EmptyState";
import { healthStatusColors } from "../../theme/statusColors";
import type { SloEvaluation } from "../../types/slo.types";

function formatAxisTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface TooltipEntry {
  payload: SloEvaluation;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.25 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {new Date(point.evaluatedAt).toLocaleString()}
      </Typography>
      <Typography variant="body2">SLI {point.sliValue}%</Typography>
      <Typography variant="body2">Error budget remaining {point.errorBudgetRemainingPercent}%</Typography>
      <Typography variant="body2">Burn rate {point.burnRate}x</Typography>
    </Box>
  );
}

// Phase 22 Auftragspunkt 14 "SLO Detail" - EIN Chart mit SLI-Wert +
// verbleibendem Error Budget, dasselbe Wiederverwendungsprinzip wie
// ApiUsageTimeseriesChart.tsx (Phase 19).
export function SloHistoryChart({ evaluations, height = 260 }: { evaluations: SloEvaluation[]; height?: number }) {
  const theme = useTheme();

  if (evaluations.length === 0) {
    return <EmptyState message="No evaluation history in this period yet." minHeight={height} />;
  }

  return (
    <Box sx={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={evaluations} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="evaluatedAt" tickFormatter={formatAxisTime} stroke={theme.palette.text.secondary} fontSize={11} minTickGap={40} />
          <YAxis stroke={theme.palette.text.secondary} fontSize={12} width={44} domain={[0, 100]} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="sliValue"
            name="SLI"
            stroke={theme.palette.primary.main}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="errorBudgetRemainingPercent"
            name="Error Budget Remaining"
            stroke={healthStatusColors.warning}
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
