import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import { formatFullWeek, formatTodayRanges, getOpenNowStatus, parseOpeningHours } from "../../utils/openingHours";

// "Wann kann ich ueberhaupt anrufen" (Nutzerwunsch 2026-09-16) - zeigt die
// vom Scraper gelieferten Oeffnungszeiten inkl. Live-Status ("jetzt
// geoeffnet/geschlossen"), volle Woche per Tooltip. Wiederverwendet in
// Acquisition.tsx und CustomerFinder.tsx.
export function OpeningHoursIndicator({ openingHours }: { openingHours: string | null }) {
  const hours = parseOpeningHours(openingHours);
  if (!hours) return null;

  const status = getOpenNowStatus(hours);
  const fullWeek = formatFullWeek(hours);

  return (
    <Tooltip
      title={
        <Stack spacing={0.25}>
          {fullWeek.map((line) => (
            <Typography key={line} variant="caption" component="div">
              {line}
            </Typography>
          ))}
        </Stack>
      }
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", cursor: "default" }}>
        <AccessTimeOutlinedIcon fontSize="inherit" color="action" />
        <Chip size="small" color={status.isOpen ? "success" : "default"} label={status.isOpen ? "Jetzt geöffnet" : "Jetzt geschlossen"} />
        <Typography variant="caption" color="text.secondary">
          Heute: {formatTodayRanges(status.todayRanges)}
        </Typography>
      </Stack>
    </Tooltip>
  );
}
