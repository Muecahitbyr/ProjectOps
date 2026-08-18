import { useState } from "react";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { MaintenanceWindowDialog } from "../components/maintenance/MaintenanceWindowDialog";
import { useDeleteMaintenanceWindow, useMaintenanceWindows } from "../hooks/useMaintenance";
import { useProjectsHealth } from "../hooks/useProjects";
import { useAuth } from "../auth/AuthContext";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime } from "../utils/formatters";
import { healthStatusColors } from "../theme/statusColors";
import type { MaintenanceWindow } from "../types/maintenance.types";

function statusOf(window: MaintenanceWindow): { label: string; color: string } {
  if (window.active) return { label: "Active", color: healthStatusColors.warning };
  if (new Date(window.startsAt).getTime() > Date.now()) return { label: "Upcoming", color: "#60a5fa" };
  return { label: "Ended", color: "#94a3b8" };
}

// Auftragspunkt 5 "Maintenance Windows" (/maintenance). Waehrend eines
// aktiven Fensters unterdrueckt der Scheduler Incidents/Alerts/
// Benachrichtigungen fuer das betroffene Projekt (siehe core/monitor.ts,
// alerts/alert-evaluator.ts) - Monitoring und Datenerfassung laufen
// unveraendert weiter.
export function Maintenance() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const windowsQuery = useMaintenanceWindows();
  const projectsQuery = useProjectsHealth();
  const deleteMutation = useDeleteMaintenanceWindow();
  const { isGlobalAdmin, hasProjectRole } = useAuth();
  const projectName = (projectId: string): string => projectsQuery.data?.find((project) => project.id === projectId)?.name ?? projectId;

  return (
    <PageContainer title="Maintenance Windows">
      {isGlobalAdmin && (
        <Stack direction="row" sx={{ justifyContent: "flex-end", mb: 3 }}>
          <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setDialogOpen(true)}>
            New window
          </Button>
        </Stack>
      )}

      {windowsQuery.isLoading ? (
        <LoadingState label="Loading maintenance windows..." minHeight={300} />
      ) : windowsQuery.isError ? (
        <ErrorState message={getErrorMessage(windowsQuery.error)} onRetry={() => windowsQuery.refetch()} minHeight={300} />
      ) : !windowsQuery.data || windowsQuery.data.length === 0 ? (
        <EmptyState message="No maintenance windows defined yet." minHeight={300} />
      ) : (
        <Stack sx={{ gap: 2 }}>
          {windowsQuery.data.map((window) => {
            const status = statusOf(window);
            return (
              <Card key={window.id}>
                <CardContent>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
                    <Stack direction="row" sx={{ gap: 1.5, alignItems: "flex-start", minWidth: 0 }}>
                      <BuildOutlinedIcon fontSize="small" sx={{ mt: 0.5, color: "text.secondary" }} />
                      <Stack sx={{ minWidth: 0 }}>
                        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                          <Typography variant="h4">{projectName(window.projectId)}</Typography>
                          <Chip size="small" label={status.label} sx={{ backgroundColor: `${status.color}1f`, color: status.color }} />
                          {window.changeId ? (
                            <Chip
                              size="small"
                              label={`From Change #${window.changeId}`}
                              variant="outlined"
                              clickable
                              onClick={() => navigate(`/changes/${window.changeId}`)}
                            />
                          ) : null}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(window.startsAt)} &rarr; {formatDateTime(window.endsAt)}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {window.reason}
                        </Typography>
                      </Stack>
                    </Stack>
                    {hasProjectRole(window.projectId, ["OWNER", "ADMIN"]) && (
                      <IconButton size="small" onClick={() => deleteMutation.mutate(window.id)} disabled={deleteMutation.isPending} aria-label="Delete window">
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      <MaintenanceWindowDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </PageContainer>
  );
}
