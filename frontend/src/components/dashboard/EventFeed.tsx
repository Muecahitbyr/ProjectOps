import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import type { ReactElement } from "react";
import type { DashboardEvent, DashboardEventType } from "../../types/event.types";
import { healthStatusColors, severityColors } from "../../theme/statusColors";
import { EmptyState } from "../common/EmptyState";

interface EventFeedProps {
  events: DashboardEvent[];
}

// Exportiert (Phase 2 "AI Operations Office Polish") - components/ai-office/
// CommunicationBubbles.tsx nutzt dieselbe Icon-/Farb-Zuordnung fuer eine
// alternative, "Bubble"-Darstellung derselben echten Dashboard-Events, statt
// eine zweite, potenziell abweichende Zuordnung zu pflegen.
export const EVENT_META: Record<DashboardEventType, { label: string; icon: ReactElement; color: string }> = {
  incident_opened: {
    label: "Incident Opened",
    icon: <ReportProblemOutlinedIcon fontSize="small" />,
    color: severityColors.CRITICAL,
  },
  incident_resolved: {
    label: "Recovery",
    icon: <CheckCircleOutlineIcon fontSize="small" />,
    color: healthStatusColors.healthy,
  },
  check_warning: {
    label: "Check Warning",
    icon: <WarningAmberOutlinedIcon fontSize="small" />,
    color: healthStatusColors.warning,
  },
  check_error: {
    label: "Check Error",
    icon: <ReportProblemOutlinedIcon fontSize="small" />,
    color: healthStatusColors.critical,
  },
  check_offline: {
    label: "Check Offline",
    icon: <CloudOffOutlinedIcon fontSize="small" />,
    color: healthStatusColors.critical,
  },
  ai_analysis_created: {
    label: "AI Analysis",
    icon: <AutoAwesomeOutlinedIcon fontSize="small" />,
    color: "#60a5fa",
  },
};

function formatEventTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// Live-Feed fuer die Dashboard-Startseite. Zeigt ausschliesslich Events, die
// das Backend tatsaechlich liefert (aktuell incident_opened/resolved) - die
// Icon-Map deckt bereits alle im Backend vorbereiteten Typen ab.
export function EventFeed({ events }: EventFeedProps) {
  if (events.length === 0) {
    return <EmptyState message="No recent activity." />;
  }

  return (
    <Stack spacing={0}>
      {events.map((event, index) => {
        const meta = EVENT_META[event.type];
        return (
          <Box
            key={`${event.incidentId}-${event.type}-${event.timestamp}`}
            sx={{
              display: "flex",
              gap: 1.5,
              py: 1.25,
              borderBottom: index === events.length - 1 ? "none" : "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ minWidth: 48, pt: 0.25, fontVariantNumeric: "tabular-nums" }}
            >
              {formatEventTime(event.timestamp)}
            </Typography>
            <Box sx={{ color: meta.color, display: "flex", pt: 0.25 }}>{meta.icon}</Box>
            <Box>
              <Typography variant="caption" sx={{ color: meta.color, fontWeight: 600, letterSpacing: "0.04em" }}>
                {meta.label.toUpperCase()}
              </Typography>
              <Typography variant="body2">{event.title}</Typography>
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
