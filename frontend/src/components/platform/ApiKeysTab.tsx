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
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useOrganizations } from "../../hooks/useOrganizations";
import { useTeams } from "../../hooks/useTeams";
import { useApiKeys, useCreateApiKey, useRevokeApiKey, useRotateApiKey } from "../../hooks/useApiKeys";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import { API_SCOPES, API_SCOPE_DESCRIPTIONS } from "../../types/api-scope.types";
import type { ApiScope } from "../../types/api-scope.types";
import { deriveApiKeyStatus } from "../../types/api-key.types";
import type { ApiKey, ApiKeyStatus } from "../../types/api-key.types";

// Phase 20 "Enterprise API Governance, Developer Portal & Credential
// Lifecycle" Auftragspunkt 1 "API Key Lifecycle" - ein einziger, abgeleiteter
// Status-Chip statt der bisherigen zwei unabhaengigen ad-hoc "Revoked"/
// "Expired"-Chips (die z.B. "ACTIVE" gar nicht sichtbar machten).
const STATUS_COLOR: Record<ApiKeyStatus, string> = {
  ACTIVE: healthStatusColors.healthy,
  EXPIRED: healthStatusColors.warning,
  REVOKED: healthStatusColors.critical,
};

// Phase 15 Teil 5 "API Keys" - der Klartext-Schluessel wird genau einmal
// bei der Erstellung gezeigt (nur der Hash wird gespeichert). Phase 16
// Auftragspunkt 10 erweitert um Scopes/Team-Zuordnung/Ablaufdatum/Usage-
// Anzeige - die hier vergebenen Scopes sind die einzigen, die
// middleware/api-key-auth.ts (Backend) tatsaechlich durchsetzt (siehe
// types/api-scope.types.ts).
export function ApiKeysTab() {
  const [organizationId, setOrganizationId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>([]);
  const [teamId, setTeamId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [revealedRotatedKey, setRevealedRotatedKey] = useState<string | null>(null);
  // Phase 20 Auftragspunkt 9/10 "Rotation UX"/"Revoke UX" - beide Aktionen
  // sind destruktiv/unumkehrbar (der bisherige Klartext-Key wird sofort
  // ungueltig) und verlangen daher eine explizite Bestaetigung statt direkt
  // beim Klick auszufuehren.
  const [confirmRotateKey, setConfirmRotateKey] = useState<ApiKey | null>(null);
  const [confirmRevokeKey, setConfirmRevokeKey] = useState<ApiKey | null>(null);
  const organizationsQuery = useOrganizations();
  const teamsQuery = useTeams(organizationId || undefined);
  const apiKeysQuery = useApiKeys(organizationId || undefined);
  const createMutation = useCreateApiKey();
  const revokeMutation = useRevokeApiKey(organizationId || undefined);
  const rotateMutation = useRotateApiKey(organizationId || undefined);

  const handleClose = (): void => {
    setDialogOpen(false);
    setDescription("");
    setScopes([]);
    setTeamId("");
    setExpiresAt("");
    createMutation.reset();
  };

  const handleConfirmRotate = (): void => {
    if (!confirmRotateKey) return;
    rotateMutation.mutate(confirmRotateKey.id, {
      onSuccess: (result) => {
        setConfirmRotateKey(null);
        setRevealedRotatedKey(result.plaintextKey);
      },
    });
  };

  const handleConfirmRevoke = (): void => {
    if (!confirmRevokeKey) return;
    revokeMutation.mutate(confirmRevokeKey.id, { onSuccess: () => setConfirmRevokeKey(null) });
  };

  const teamNameById = new Map((teamsQuery.data ?? []).map((team) => [team.id, team.name]));

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
          New API key
        </Button>
      </Stack>

      {!organizationId ? (
        <EmptyState message="Select an organization to view its API keys." minHeight={200} />
      ) : apiKeysQuery.isLoading ? (
        <LoadingState label="Loading API keys..." minHeight={200} />
      ) : apiKeysQuery.isError || !apiKeysQuery.data ? (
        <ErrorState message={getErrorMessage(apiKeysQuery.error)} onRetry={() => apiKeysQuery.refetch()} minHeight={200} />
      ) : apiKeysQuery.data.length === 0 ? (
        <EmptyState message="No API keys yet." minHeight={200} />
      ) : (
        <Stack sx={{ gap: 2 }}>
          {apiKeysQuery.data.map((key) => {
            const status = deriveApiKeyStatus(key);
            return (
              <Card key={key.id}>
                <CardContent>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
                    <Stack sx={{ minWidth: 0 }}>
                      <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                        <Typography variant="h4">{key.description}</Typography>
                        <Chip size="small" label={status} sx={{ backgroundColor: `${STATUS_COLOR[status]}1f`, color: STATUS_COLOR[status] }} />
                        {key.teamId ? <Chip size="small" variant="outlined" label={teamNameById.get(key.teamId) ?? "Team"} /> : null}
                      </Stack>
                      <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                        {key.scopes.length === 0 ? (
                          <Typography variant="caption" color="text.secondary">
                            No scopes (key cannot call /api/v1)
                          </Typography>
                        ) : (
                          key.scopes.map((scope) => <Chip key={scope} size="small" variant="outlined" label={scope} />)
                        )}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {key.keyPrefix}… · {key.usageCount} requests
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Created {formatDateTime(key.createdAt)} · Last used {formatDateTime(key.lastUsedAt)}
                        {key.expiresAt ? ` · Expires ${formatDateTime(key.expiresAt)}` : ""}
                      </Typography>
                    </Stack>
                    {status !== "REVOKED" ? (
                      <Stack direction="row" sx={{ gap: 1 }}>
                        <Button size="small" variant="outlined" onClick={() => setConfirmRotateKey(key)} disabled={rotateMutation.isPending}>
                          Rotate
                        </Button>
                        <Button size="small" color="error" onClick={() => setConfirmRevokeKey(key)} disabled={revokeMutation.isPending}>
                          Revoke
                        </Button>
                      </Stack>
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>New API key</DialogTitle>
        <DialogContent>
          {createMutation.data ? (
            <Stack sx={{ gap: 2, pt: 1 }}>
              <Alert severity="warning">
                <strong>Save this key now. It cannot be displayed again.</strong> Copy it and store it somewhere safe (e.g. a secrets manager) -
                the server only ever stores a hash, never the key itself.
              </Alert>
              <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                <TextField label="API Key" value={createMutation.data.plaintextKey} fullWidth slotProps={{ input: { readOnly: true } }} />
                <IconButton onClick={() => void navigator.clipboard.writeText(createMutation.data!.plaintextKey)} aria-label="Copy key">
                  <ContentCopyOutlinedIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          ) : (
            <Stack sx={{ gap: 2, pt: 1 }}>
              <TextField
                label="Name"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                autoFocus
                fullWidth
                placeholder="e.g. CI/CD pipeline"
              />
              <Stack sx={{ gap: 0.5 }}>
                <Typography variant="body2">Scopes</Typography>
                <Typography variant="caption" color="text.secondary">
                  Only selected scopes will be usable against /api/v1 - a key never inherits Organization Owner rights. Each scope is explicit and
                  independent; enabling one never implicitly grants another (e.g. automation:write only lets a key manage automation RULES from a
                  restricted, safe action whitelist - it does not grant automation:execute).
                </Typography>
                <Stack sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1 }}>
                  {API_SCOPES.map((scope) => (
                    <FormControlLabel
                      key={scope}
                      sx={{ alignItems: "flex-start", ml: 0 }}
                      control={
                        <Checkbox
                          checked={scopes.includes(scope)}
                          onChange={(event) =>
                            setScopes((current) => (event.target.checked ? [...current, scope] : current.filter((s) => s !== scope)))
                          }
                          sx={{ pt: 0.25 }}
                        />
                      }
                      label={
                        <Stack sx={{ py: 0.5 }}>
                          <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                            {scope}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {API_SCOPE_DESCRIPTIONS[scope]}
                          </Typography>
                        </Stack>
                      }
                    />
                  ))}
                </Stack>
              </Stack>
              <TextField select label="Team (optional)" value={teamId} onChange={(event) => setTeamId(event.target.value)} fullWidth>
                <MenuItem value="">Organization-wide (no team)</MenuItem>
                {(teamsQuery.data ?? []).map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Expires at (optional)"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
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
              <Button
                variant="contained"
                disabled={!description.trim() || createMutation.isPending}
                onClick={() =>
                  createMutation.mutate({
                    organizationId,
                    description: description.trim(),
                    ...(scopes.length > 0 ? { scopes } : {}),
                    ...(teamId ? { teamId } : {}),
                    ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
                  })
                }
              >
                Create
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(revealedRotatedKey)} onClose={() => setRevealedRotatedKey(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Rotated API key</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2, pt: 1 }}>
            <Alert severity="warning">
              <strong>Save this key now. It cannot be displayed again.</strong> The previous key stopped working immediately.
            </Alert>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
              <TextField label="New API Key" value={revealedRotatedKey ?? ""} fullWidth slotProps={{ input: { readOnly: true } }} />
              <IconButton onClick={() => revealedRotatedKey && void navigator.clipboard.writeText(revealedRotatedKey)} aria-label="Copy key">
                <ContentCopyOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setRevealedRotatedKey(null)}>
            Done
          </Button>
        </DialogActions>
      </Dialog>

      {/* Phase 20 Auftragspunkt 9 "Rotation UX" - Bestaetigung vor der
          unumkehrbaren Aktion, statt sofort beim Klick zu rotieren. */}
      <Dialog open={Boolean(confirmRotateKey)} onClose={() => setConfirmRotateKey(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Rotate "{confirmRotateKey?.description}"?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            The current key will stop working immediately once rotated. Any application still using it will start failing until updated with the
            new key.
          </Alert>
          {rotateMutation.isError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {getErrorMessage(rotateMutation.error)}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRotateKey(null)} disabled={rotateMutation.isPending}>
            Cancel
          </Button>
          <Button variant="contained" color="warning" onClick={handleConfirmRotate} disabled={rotateMutation.isPending}>
            Rotate key
          </Button>
        </DialogActions>
      </Dialog>

      {/* Phase 20 Auftragspunkt 10 "Revoke UX" - Bestaetigung vor der
          unumkehrbaren Aktion; nach Erfolg verschwindet der Key ohne
          Full-Page-Reload aus "Active" (React-Query-Invalidierung ueber
          Realtime, siehe useRealtime.ts). */}
      <Dialog open={Boolean(confirmRevokeKey)} onClose={() => setConfirmRevokeKey(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Revoke "{confirmRevokeKey?.description}"?</DialogTitle>
        <DialogContent>
          <Alert severity="error">
            This immediately and permanently invalidates the key. Any application still using it will start failing right away. This cannot be
            undone.
          </Alert>
          {revokeMutation.isError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {getErrorMessage(revokeMutation.error)}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRevokeKey(null)} disabled={revokeMutation.isPending}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleConfirmRevoke} disabled={revokeMutation.isPending}>
            Revoke key
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
