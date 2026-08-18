import { useState } from "react";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useCreateDeployment, useDeleteDeployment, useDeployments } from "../../hooks/useDeployments";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";
import { healthStatusColors, severityColors } from "../../theme/statusColors";
import { DEPLOYMENT_STATUSES } from "../../types/deployment.types";
import type { Deployment, DeploymentStatus } from "../../types/deployment.types";

const STATUS_COLOR: Record<DeploymentStatus, string> = {
  SUCCESS: healthStatusColors.healthy,
  FAILED: severityColors.CRITICAL,
  IN_PROGRESS: healthStatusColors.warning,
};

// Phase 27 "Enterprise Deployment Tracking & Change Correlation" -
// eigenstaendiges Panel (analog zu AlertRuleList/ProjectMembersPanel),
// direkt in ProjectDetails.tsx eingebettet statt einer eigenen Unterseite -
// Deployments sind Projekt-Stammdaten wie Alert Rules/Team, keine eigene
// Navigationsebene wert.
export function DeploymentsPanel({ projectId }: { projectId: string }) {
  const deploymentsQuery = useDeployments(projectId, { limit: 20 });
  const createMutation = useCreateDeployment();
  const deleteMutation = useDeleteDeployment();
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Deployment | null>(null);
  const [version, setVersion] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [status, setStatus] = useState<DeploymentStatus>("SUCCESS");
  const [description, setDescription] = useState("");

  function resetForm() {
    setVersion("");
    setEnvironment("production");
    setStatus("SUCCESS");
    setDescription("");
  }

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h3">Deployments</Typography>
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
          Record deployment
        </Button>
      </Stack>

      {deploymentsQuery.isLoading ? (
        <LoadingState minHeight={120} />
      ) : deploymentsQuery.isError ? (
        <ErrorState message={getErrorMessage(deploymentsQuery.error)} onRetry={() => deploymentsQuery.refetch()} minHeight={120} />
      ) : !deploymentsQuery.data || deploymentsQuery.data.length === 0 ? (
        <EmptyState message="No deployments recorded for this project yet." minHeight={120} />
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Version</TableCell>
                <TableCell>Environment</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Deployed</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {deploymentsQuery.data.map((deployment) => (
                <TableRow key={deployment.id}>
                  <TableCell>
                    <Typography variant="body2">{deployment.version}</Typography>
                    {deployment.description ? (
                      <Typography variant="caption" color="text.secondary">
                        {deployment.description}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>{deployment.environment}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={deployment.status}
                      sx={{ backgroundColor: `${STATUS_COLOR[deployment.status]}1f`, color: STATUS_COLOR[deployment.status] }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" title={formatDateTime(deployment.deployedAt)}>
                      {formatDateTime(deployment.deployedAt)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" aria-label="Delete deployment" onClick={() => setConfirmDelete(deployment)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Record a deployment</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2, mt: 1 }}>
            <TextField
              label="Version"
              placeholder="e.g. v2.4.1 or a git SHA"
              size="small"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              autoFocus
            />
            <TextField label="Environment" size="small" value={environment} onChange={(e) => setEnvironment(e.target.value)} />
            <TextField select label="Status" size="small" value={status} onChange={(e) => setStatus(e.target.value as DeploymentStatus)}>
              {DEPLOYMENT_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Description (optional)"
              size="small"
              multiline
              minRows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {createMutation.isError ? <Alert severity="error">{getErrorMessage(createMutation.error)}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!version.trim() || createMutation.isPending}
            onClick={() =>
              createMutation.mutate(
                {
                  projectId,
                  input: {
                    version: version.trim(),
                    environment: environment.trim() || undefined,
                    status,
                    ...(description.trim() ? { description: description.trim() } : {}),
                  },
                },
                { onSuccess: () => { setFormOpen(false); resetForm(); } },
              )
            }
          >
            Record
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete this deployment record?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            This removes the historical record of {confirmDelete?.version} ({confirmDelete?.environment}). This cannot be undone.
          </Alert>
          {deleteMutation.isError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {getErrorMessage(deleteMutation.error)}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (!confirmDelete) return;
              deleteMutation.mutate({ id: confirmDelete.id, projectId }, { onSuccess: () => setConfirmDelete(null) });
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
