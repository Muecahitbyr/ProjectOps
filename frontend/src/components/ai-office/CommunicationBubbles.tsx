import { memo } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { EmptyState } from "../common/EmptyState";
import { EVENT_META } from "../dashboard/EventFeed";
import { formatRelativeTime } from "../../utils/formatters";
import type { DashboardEvent } from "../../types/event.types";

interface CommunicationBubblesProps {
  events: DashboardEvent[];
}

// Dieselben echten Dashboard-Events wie EventFeed (GET /api/dashboard/events,
// Phase 1), nur als "Kommunikations-Bubbles" dargestellt statt als
// klassische Tabellenzeile - passend zur Buero-Metapher ("das Unternehmen
// meldet sich"), keine neue Datenquelle, keine erfundenen Nachrichten.
export const CommunicationBubbles = memo(function CommunicationBubbles({ events }: CommunicationBubblesProps) {
  if (events.length === 0) {
    return <EmptyState message="No activity yet." minHeight={100} />;
  }

  return (
    <Stack spacing={1.25}>
      {events.map((event) => {
        const meta = EVENT_META[event.type];
        return (
          <Stack key={`${event.incidentId}-${event.type}-${event.timestamp}`} direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
            <Box
              sx={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${meta.color}22`,
                color: meta.color,
              }}
            >
              {meta.icon}
            </Box>
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                borderRadius: "4px 12px 12px 12px",
                border: "1px solid",
                borderColor: "divider",
                backgroundColor: "action.hover",
                px: 1.5,
                py: 1,
              }}
            >
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Typography variant="caption" sx={{ color: meta.color, fontWeight: 600, letterSpacing: "0.04em" }}>
                  {meta.label.toUpperCase()}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  {formatRelativeTime(event.timestamp)}
                </Typography>
              </Stack>
              <Typography variant="body2">{event.title}</Typography>
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
});
