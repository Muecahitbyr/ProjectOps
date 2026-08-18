import { useTheme, alpha } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import { EmptyState } from "../common/EmptyState";
import type { HeatmapCell } from "../../types/analytics.types";

interface IncidentHeatmapProps {
  cells: HeatmapCell[];
  onCellClick?: (cell: HeatmapCell) => void;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// 7x24-Gitter (Wochentag x Stunde) statt einer externen Heatmap-Bibliothek -
// Farbintensitaet = Incident-Anzahl relativ zum Maximum in der Matrix. Ein
// Klick auf eine Zelle oeffnet den Drill-Down-Dialog fuer genau diese
// Kombination aus Wochentag+Stunde (siehe AnalyticsIncidents.tsx).
export function IncidentHeatmap({ cells, onCellClick }: IncidentHeatmapProps) {
  const theme = useTheme();

  if (cells.length === 0) {
    return <EmptyState message="No incident data yet." minHeight={200} />;
  }

  const maxCount = Math.max(1, ...cells.map((cell) => cell.count));
  const byPosition = new Map(cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell]));

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "40px repeat(24, minmax(20px, 1fr))", gap: "3px", minWidth: 640 }}>
        <Box />
        {Array.from({ length: 24 }, (_, hour) => (
          <Typography key={hour} variant="caption" color="text.secondary" sx={{ textAlign: "center", fontSize: 10 }}>
            {hour}
          </Typography>
        ))}
        {WEEKDAY_LABELS.map((label, weekday) => (
          <Box key={label} sx={{ display: "contents" }}>
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
              {label}
            </Typography>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = byPosition.get(`${weekday}:${hour}`) ?? { weekday, hour, count: 0 };
              const intensity = cell.count / maxCount;
              return (
                <Tooltip key={hour} title={`${label} ${hour}:00 - ${cell.count} incident(s)`}>
                  <Box
                    onClick={() => onCellClick?.(cell)}
                    sx={{
                      aspectRatio: "1",
                      borderRadius: 0.5,
                      bgcolor:
                        cell.count === 0
                          ? theme.palette.action.hover
                          : alpha(theme.palette.error.main, 0.15 + intensity * 0.75),
                      cursor: onCellClick && cell.count > 0 ? "pointer" : "default",
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
