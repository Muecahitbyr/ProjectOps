import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import { useTheme } from "@mui/material/styles";
import { EmptyState } from "../common/EmptyState";
import type { AutomationHeatmapCell } from "../../types/automation.types";

interface AutomationExecutionHeatmapProps {
  cells: AutomationHeatmapCell[];
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Teil 7 "Execution Heatmap" - Wochentag x Stunde. Ein leichtgewichtiges,
// selbstgebautes Raster statt einer neuen Chart-Bibliothek fuer eine
// einzelne Heatmap.
export function AutomationExecutionHeatmap({ cells }: AutomationExecutionHeatmapProps) {
  const theme = useTheme();

  if (cells.length === 0) {
    return <EmptyState message="No execution data yet." minHeight={160} />;
  }

  const byKey = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell.count]));
  const maxCount = Math.max(...cells.map((cell) => cell.count), 1);

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "40px repeat(24, 1fr)", gap: "2px", minWidth: 640 }}>
        <Box />
        {Array.from({ length: 24 }, (_, hour) => (
          <Box key={hour} sx={{ fontSize: 10, color: "text.secondary", textAlign: "center" }}>
            {hour % 3 === 0 ? hour : ""}
          </Box>
        ))}
        {WEEKDAY_LABELS.map((label, index) => {
          const isoWeekday = index + 1;
          return (
            <Box key={label} sx={{ display: "contents" }}>
              <Box sx={{ fontSize: 11, color: "text.secondary", display: "flex", alignItems: "center" }}>{label}</Box>
              {Array.from({ length: 24 }, (_, hour) => {
                const count = byKey.get(`${isoWeekday}-${hour}`) ?? 0;
                const intensity = count === 0 ? 0 : 0.15 + 0.85 * (count / maxCount);
                return (
                  <Tooltip key={hour} title={`${label} ${hour}:00 - ${count} execution${count === 1 ? "" : "s"}`}>
                    <Box
                      sx={{
                        aspectRatio: "1 / 1",
                        borderRadius: "3px",
                        bgcolor: count === 0 ? "action.hover" : theme.palette.primary.main,
                        opacity: count === 0 ? 1 : intensity,
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
