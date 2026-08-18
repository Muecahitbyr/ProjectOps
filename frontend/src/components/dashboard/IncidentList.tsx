import { useNavigate } from "react-router-dom";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import type { Incident } from "../../types/incident.types";
import { deriveIncidentStatus } from "../../types/incident.types";
import { severityColors, severityLabels } from "../../theme/statusColors";
import { formatDateTime, formatRelativeTime } from "../../utils/formatters";
import { EmptyState } from "../common/EmptyState";

interface IncidentListProps {
  incidents: Incident[];
  projectNames?: Record<string, string>;
  emptyMessage?: string;
}

// Phase 21 "Enterprise Alerting, Incident Response & Notification
// Orchestration" Auftragspunkt 12/13 - jede Zeile navigiert jetzt zur
// neuen Incident-Detailseite (/incidents/:id); der Status-Chip zeigt den
// vollen abgeleiteten Lifecycle (OPEN/ACKNOWLEDGED/RESOLVED) statt nur
// "Resolved" (ACKNOWLEDGED war vorher gar nicht sichtbar). Wiederverwendet
// auf der Projekt-Detailseite (recentIncidents) und der Incidents-Seite
// (globale, gefilterte Liste). projectNames ist optional - ohne Uebergabe
// wird die rohe projectId angezeigt statt eines erfundenen Namens.
export function IncidentList({ incidents, projectNames, emptyMessage = "No incidents." }: IncidentListProps) {
  const navigate = useNavigate();

  if (incidents.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <List disablePadding>
      {incidents.map((incident) => {
        const status = deriveIncidentStatus(incident);
        return (
          <ListItemButton
            key={incident.id}
            disableGutters
            onClick={() => navigate(`/incidents/${incident.id}`)}
            sx={{
              borderBottom: "1px solid",
              borderColor: "divider",
              py: 1.5,
              px: 1,
              "&:last-of-type": { borderBottom: "none" },
            }}
          >
            <Box sx={{ width: "100%" }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Chip
                    size="small"
                    label={severityLabels[incident.severity]}
                    sx={{
                      backgroundColor: `${severityColors[incident.severity]}1f`,
                      color: severityColors[incident.severity],
                      border: `1px solid ${severityColors[incident.severity]}40`,
                    }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {projectNames?.[incident.projectId] ?? incident.projectId} · {incident.checkId}
                  </Typography>
                  {status !== "OPEN" ? <Chip size="small" label={status} variant="outlined" /> : null}
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  title={formatDateTime(incident.createdAt)}
                >
                  {formatRelativeTime(incident.createdAt)}
                </Typography>
              </Stack>
              <Typography variant="body2">{incident.title}</Typography>
              {incident.description ? (
                <Typography variant="caption" color="text.secondary">
                  {incident.description}
                </Typography>
              ) : null}
            </Box>
          </ListItemButton>
        );
      })}
    </List>
  );
}
