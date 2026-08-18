import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import { useMaintenanceWindows } from "../../hooks/useMaintenance";
import { useProjectsHealth } from "../../hooks/useProjects";
import { formatDateTime } from "../../utils/formatters";

interface ActiveMaintenanceBannerProps {
  projectId?: string;
}

// Phase 13 Teil 5 "Maintenance Erweiterung" - macht aktive Wartungsfenster
// zusaetzlich auf Mini City/Analytics/Incidents/Alerts sichtbar (bisher nur
// auf Dashboard/ProjectDetails, siehe Auftrag). Reine Anzeige, keine eigene
// Datenquelle - useMaintenanceWindows() ist bereits event-/polling-
// synchronisiert (siehe useRealtime.ts: MAINTENANCE_STARTED/ENDED).
export function ActiveMaintenanceBanner({ projectId }: ActiveMaintenanceBannerProps) {
  const windowsQuery = useMaintenanceWindows(projectId);
  const projectsQuery = useProjectsHealth();

  const activeWindows = (windowsQuery.data ?? []).filter((window) => window.active);
  if (activeWindows.length === 0) {
    return null;
  }

  const projectName = (id: string): string => projectsQuery.data?.find((project) => project.id === id)?.name ?? id;

  return (
    <Stack sx={{ gap: 1, mb: 3 }}>
      {activeWindows.map((window) => (
        <Alert key={window.id} severity="info" variant="outlined">
          <AlertTitle>Maintenance in progress: {projectName(window.projectId)}</AlertTitle>
          {window.reason} · Until {formatDateTime(window.endsAt)}
        </Alert>
      ))}
    </Stack>
  );
}
