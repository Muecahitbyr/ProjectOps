import { useState } from "react";
import type { MouseEvent } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Popover from "@mui/material/Popover";
import Typography from "@mui/material/Typography";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import { formatFullWeek, formatTodayRanges, getOpenNowStatus, parseOpeningHours } from "../../utils/openingHours";

// "Wann kann ich ueberhaupt anrufen" (Nutzerwunsch 2026-09-16) - zeigt die
// vom Scraper gelieferten Oeffnungszeiten inkl. Live-Status ("jetzt
// geoeffnet/geschlossen"). Klick auf die heutige Zeile oeffnet ein Popover
// mit der ganzen Woche (Nutzerwunsch, statt Hover-Tooltip - funktioniert
// auch auf dem Handy). Wiederverwendet in Acquisition.tsx und
// CustomerFinder.tsx.
export function OpeningHoursIndicator({ openingHours }: { openingHours: string | null }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const hours = parseOpeningHours(openingHours);
  if (!hours) return null;

  const status = getOpenNowStatus(hours);
  const fullWeek = formatFullWeek(hours);

  function handleOpen(event: MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);
  }

  return (
    <>
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ alignItems: "center", cursor: "pointer", "&:hover": { opacity: 0.8 } }}
        onClick={handleOpen}
      >
        <AccessTimeOutlinedIcon fontSize="inherit" color="action" />
        <Chip size="small" color={status.isOpen ? "success" : "default"} label={status.isOpen ? "Jetzt geöffnet" : "Jetzt geschlossen"} />
        <Typography variant="caption" color="text.secondary">
          Heute: {formatTodayRanges(status.todayRanges)}
        </Typography>
      </Stack>
      <Popover
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 1.5, minWidth: 200 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
            Öffnungszeiten
          </Typography>
          <Stack spacing={0.25}>
            {fullWeek.map(({ day, text }) => (
              <Stack key={day} direction="row" spacing={2} sx={{ justifyContent: "space-between" }}>
                <Typography variant="body2" sx={{ fontWeight: day === status.todayLabel ? 700 : 400 }}>
                  {day}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: day === status.todayLabel ? 700 : 400 }} color={text === "Geschlossen" ? "text.secondary" : "text.primary"}>
                  {text}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Popover>
    </>
  );
}
