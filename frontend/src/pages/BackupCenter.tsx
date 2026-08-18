import { useState } from "react";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import RestoreOutlinedIcon from "@mui/icons-material/RestoreOutlined";
import BackupOutlinedIcon from "@mui/icons-material/BackupOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useBackups, useCreateBackup, useRestoreBackup } from "../hooks/useBackups";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime } from "../utils/formatters";

// Phase 13 Teil 8 "Backup Center" - kein Shell-Aufruf, keine externen Tools:
// jedes Backup ist ein JSON-Snapshot ueber bestehende Repository-Funktionen
// (backup/backup-service.ts). Restore erzeugt neue Zeilen statt zu
// ueberschreiben (siehe Backend-Kommentar dort) - die Zusammenfassung nach
// dem Restore zeigt genau das an.
export function BackupCenter() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState("");
  const backupsQuery = useBackups();
  const createMutation = useCreateBackup();
  const restoreMutation = useRestoreBackup();

  const handleCreate = (): void => {
    if (!label.trim()) return;
    createMutation.mutate(label.trim(), {
      onSuccess: () => {
        setDialogOpen(false);
        setLabel("");
      },
    });
  };

  return (
    <PageContainer title="Backup Center">
      <Stack direction="row" sx={{ justifyContent: "flex-end", mb: 3 }}>
        <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setDialogOpen(true)}>
          New backup
        </Button>
      </Stack>

      {backupsQuery.isLoading ? (
        <LoadingState label="Loading backups..." minHeight={300} />
      ) : backupsQuery.isError || !backupsQuery.data ? (
        <ErrorState message={getErrorMessage(backupsQuery.error)} onRetry={() => backupsQuery.refetch()} minHeight={300} />
      ) : backupsQuery.data.length === 0 ? (
        <EmptyState message="No backups created yet." minHeight={300} />
      ) : (
        <Stack sx={{ gap: 2 }}>
          {backupsQuery.data.map((backup) => (
            <Card key={backup.id}>
              <CardContent>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
                  <Stack direction="row" sx={{ gap: 1.5, alignItems: "flex-start", minWidth: 0 }}>
                    <BackupOutlinedIcon fontSize="small" sx={{ mt: 0.5, color: "text.secondary" }} />
                    <Stack sx={{ minWidth: 0 }}>
                      <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                        <Typography variant="h4">{backup.label}</Typography>
                        {backup.restoredAt ? <Chip size="small" label="Restored" color="success" variant="outlined" /> : null}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Created {formatDateTime(backup.createdAt)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {backup.data.alertRules.length} alert rules · {backup.data.automationRules.length} automation rules ·{" "}
                        {backup.data.maintenanceWindows.length} maintenance windows · {backup.data.notificationSettings.length} notification settings ·{" "}
                        {backup.data.users.length} users
                      </Typography>
                      {backup.restoredAt ? (
                        <Typography variant="caption" color="text.secondary">
                          Restored {formatDateTime(backup.restoredAt)}
                        </Typography>
                      ) : null}
                    </Stack>
                  </Stack>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RestoreOutlinedIcon fontSize="small" />}
                    disabled={Boolean(backup.restoredAt) || restoreMutation.isPending}
                    onClick={() => restoreMutation.mutate(backup.id)}
                  >
                    Restore
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New backup</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            sx={{ mt: 1 }}
            placeholder="e.g. before-Q3-config-change"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!label.trim() || createMutation.isPending}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
