import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../common/EmptyState";
import type { ForecastResult } from "../../types/forecast.types";

interface ForecastChartProps {
  forecast: ForecastResult;
  height?: number;
}

interface ChartRow {
  timestamp: string;
  historical: number | null;
  predicted: number | null;
}

function formatAxisDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Zwei Line-Serien (historical/predicted) statt einer - macht auf einen
// Blick sichtbar, wo echte Beobachtung endet und die Vorhersage beginnt.
// Der letzte historische Punkt wird in beiden Serien gefuehrt, damit die
// Linien luekenlos ineinander uebergehen.
function toChartRows(forecast: ForecastResult): ChartRow[] {
  const rows: ChartRow[] = forecast.points.map((point) => ({
    timestamp: point.timestamp,
    historical: point.predicted ? null : point.value,
    predicted: point.predicted ? point.value : null,
  }));
  const lastHistoricalIndex = rows.map((row) => row.historical !== null).lastIndexOf(true);
  if (lastHistoricalIndex >= 0 && rows[lastHistoricalIndex + 1]) {
    rows[lastHistoricalIndex]!.predicted = rows[lastHistoricalIndex]!.historical;
  }
  return rows;
}

export function ForecastChart({ forecast, height = 240 }: ForecastChartProps) {
  const theme = useTheme();

  if (!forecast.sufficientData || forecast.points.length === 0) {
    return <EmptyState message="Not enough historical data yet for a forecast." minHeight={height} />;
  }

  const rows = toChartRows(forecast);

  return (
    <Box sx={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="timestamp" tickFormatter={formatAxisDate} stroke={theme.palette.text.secondary} fontSize={12} minTickGap={40} />
          <YAxis stroke={theme.palette.text.secondary} fontSize={12} width={48} allowDecimals={false} />
          <Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString()} />
          <Line type="monotone" dataKey="historical" name="Observed" stroke={theme.palette.primary.main} strokeWidth={1.5} dot={false} connectNulls />
          <Line
            type="monotone"
            dataKey="predicted"
            name="Predicted"
            stroke={theme.palette.warning.main}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      <Typography variant="caption" color="text.secondary">
        Linear regression · R² {forecast.rSquared === null ? "n/a" : forecast.rSquared.toFixed(3)}
        {forecast.slopePerDay !== null ? ` · trend ${forecast.slopePerDay > 0 ? "+" : ""}${forecast.slopePerDay}/day` : ""}
      </Typography>
    </Box>
  );
}
