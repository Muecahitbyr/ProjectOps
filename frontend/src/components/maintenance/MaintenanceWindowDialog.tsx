import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import { useCreateMaintenanceWindow } from "../../hooks/useMaintenance";
import { useProjectsHealth } from "../../hooks/useProjects";
import { useAuth } from "../../auth/AuthContext";
import { getErrorMessage } from "../../utils/getErrorMessage";

interface MaintenanceWindowDialogProps {
  open: boolean;
  onClose: () => void;
}

// Lokale Zeit ohne Zeitzonen-Suffix (datetime-local) -> new Date(...)
// interpretiert das als lokale Browserzeit, .toISOString() wandelt korrekt
// nach UTC fuer die API um (siehe auch RangeSelector.tsx in components/analytics).
function toIsoOrEmpty(localValue: string): string {
  if (!localValue) return "";
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function MaintenanceWindowDialog({ open, onClose }: MaintenanceWindowDialogProps) {
  const projectsQuery = useProjectsHealth();
  const { user } = useAuth();
  const mutation = useCreateMaintenanceWindow();

  const [projectId, setProjectId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  const handleClose = (): void => {
    if (mutation.isPending) return;
    setProjectId("");
    setStartsAt("");
    setEndsAt("");
    setReason("");
    mutation.reset();
    onClose();
  };

  const canSubmit = projectId.length > 0 && startsAt.length > 0 && endsAt.length > 0 && reason.trim().length > 0;

  const handleSubmit = (): void => {
    mutation.mutate(
      {
        projectId,
        startsAt: toIsoOrEmpty(startsAt),
        endsAt: toIsoOrEmpty(endsAt),
        reason: reason.trim(),
        ...(user ? { createdBy: user.id } : {}),
      },
      { onSuccess: handleClose },
    );
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>New maintenance window</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, pt: 1 }}>
          {mutation.isError ? <Alert severity="error">{getErrorMessage(mutation.error)}</Alert> : null}
          <TextField select label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)} fullWidth autoFocus>
            {(projectsQuery.data ?? []).map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Start"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
          <TextField
            label="End"
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
          <TextField label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} multiline minRows={2} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!canSubmit || mutation.isPending}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
