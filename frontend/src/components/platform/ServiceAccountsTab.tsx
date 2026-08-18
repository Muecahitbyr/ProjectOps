import { useState } from "react";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useOrganizations } from "../../hooks/useOrganizations";
import { useCreateServiceAccount, useRevokeServiceAccount, useRotateServiceAccountSecret, useServiceAccounts } from "../../hooks/useServiceAccounts";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";

// Phase 15 Teil 6 "Service Accounts" - "Nur Backend": kein Login-Flow,
// ausschliesslich maschinelle Bearer-Authentifizierung. Diese Seite ist die
// Verwaltungsoberflaeche eines menschlichen Operators, nicht des
// Service-Accounts selbst.
export function ServiceAccountsTab() {
  const [organizationId, setOrganizationId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const organizationsQuery = useOrganizations();
  const accountsQuery = useServiceAccounts(organizationId || undefined);
  const createMutation = useCreateServiceAccount();
  const rotateMutation = useRotateServiceAccountSecret(organizationId || undefined);
  const revokeMutation = useRevokeServiceAccount(organizationId || undefined);

  const handleClose = (): void => {
    setDialogOpen(false);
    setName("");
    createMutation.reset();
  };

  return (
    <Stack sx={{ gap: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <TextField select label="Organization" size="small" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="">Select an organization</MenuItem>
          {(organizationsQuery.data ?? []).map((org) => (
            <MenuItem key={org.id} value={org.id}>
              {org.name}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" startIcon={<AddOutlinedIcon />} disabled={!organizationId} onClick={() => setDialogOpen(true)}>
          New service account
        </Button>
      </Stack>

      {!organizationId ? (
        <EmptyState message="Select an organization to view its service accounts." minHeight={200} />
      ) : accountsQuery.isLoading ? (
        <LoadingState label="Loading service accounts..." minHeight={200} />
      ) : accountsQuery.isError || !accountsQuery.data ? (
        <ErrorState message={getErrorMessage(accountsQuery.error)} onRetry={() => accountsQuery.refetch()} minHeight={200} />
      ) : accountsQuery.data.length === 0 ? (
        <EmptyState message="No service accounts yet." minHeight={200} />
      ) : (
        <Stack sx={{ gap: 2 }}>
          {accountsQuery.data.map((account) => (
            <Card key={account.id}>
              <CardContent>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
                  <Stack>
                    <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                      <Typography variant="h4">{account.name}</Typography>
                      <Chip
                        size="small"
                        label={account.status}
                        sx={{
                          backgroundColor: `${account.status === "ACTIVE" ? healthStatusColors.healthy : healthStatusColors.critical}1f`,
                          color: account.status === "ACTIVE" ? healthStatusColors.healthy : healthStatusColors.critical,
                        }}
                      />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Created {formatDateTime(account.createdAt)} · Secret rotated {formatDateTime(account.secretRotatedAt)}
                    </Typography>
                  </Stack>
                  {account.status === "ACTIVE" ? (
                    <Stack direction="row" sx={{ gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() =>
                          rotateMutation.mutate(account.id, { onSuccess: (result) => setRevealedSecret(result.plaintextSecret) })
                        }
                      >
                        Rotate secret
                      </Button>
                      <Button size="small" color="error" onClick={() => revokeMutation.mutate(account.id)}>
                        Revoke
                      </Button>
                    </Stack>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>New service account</DialogTitle>
        <DialogContent>
          {createMutation.data ? (
            <Stack sx={{ gap: 2, pt: 1 }}>
              <Alert severity="warning">This secret is shown only once. Copy it now - it cannot be retrieved again.</Alert>
              <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                <TextField label="Secret" value={createMutation.data.plaintextSecret} fullWidth slotProps={{ input: { readOnly: true } }} />
                <IconButton onClick={() => void navigator.clipboard.writeText(createMutation.data!.plaintextSecret)} aria-label="Copy secret">
                  <ContentCopyOutlinedIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          ) : (
            <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} autoFocus fullWidth sx={{ mt: 1 }} placeholder="e.g. ci-bot" />
          )}
        </DialogContent>
        <DialogActions>
          {createMutation.data ? (
            <Button variant="contained" onClick={handleClose}>
              Done
            </Button>
          ) : (
            <>
              <Button onClick={handleClose}>Cancel</Button>
              <Button variant="contained" disabled={!name.trim() || createMutation.isPending} onClick={() => createMutation.mutate({ organizationId, name: name.trim() })}>
                Create
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(revealedSecret)} onClose={() => setRevealedSecret(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Rotated secret</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2, pt: 1 }}>
            <Alert severity="warning">This secret is shown only once. Copy it now - it cannot be retrieved again.</Alert>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
              <TextField label="New Secret" value={revealedSecret ?? ""} fullWidth slotProps={{ input: { readOnly: true } }} />
              <IconButton onClick={() => revealedSecret && void navigator.clipboard.writeText(revealedSecret)} aria-label="Copy secret">
                <ContentCopyOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setRevealedSecret(null)}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
