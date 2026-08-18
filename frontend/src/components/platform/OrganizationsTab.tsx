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
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useCreateOrganization, useOrganizations } from "../../hooks/useOrganizations";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import type { OrganizationPlan } from "../../types/organization.types";

const PLAN_COLOR: Record<OrganizationPlan, string> = {
  FREE: "#64748b",
  PRO: "#3b82f6",
  ENTERPRISE: healthStatusColors.healthy,
};

// Phase 15 Teil 2 "Organisationen" - Verwaltung aller Mandanten. Die
// Default-Organisation (Migration 0033) enthaelt automatisch alle vor
// Phase 15 bestehenden Projekte - keine Fake-Organisation, sondern das
// echte automatische Backfill-Ergebnis.
export function OrganizationsTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const organizationsQuery = useOrganizations();
  const createMutation = useCreateOrganization();

  const handleClose = (): void => {
    setDialogOpen(false);
    setName("");
    setSlug("");
    createMutation.reset();
  };

  const handleCreate = (): void => {
    createMutation.mutate({ name: name.trim(), slug: slug.trim() }, { onSuccess: handleClose });
  };

  return (
    <Stack sx={{ gap: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setDialogOpen(true)}>
          New organization
        </Button>
      </Stack>

      {organizationsQuery.isLoading ? (
        <LoadingState label="Loading organizations..." minHeight={200} />
      ) : organizationsQuery.isError || !organizationsQuery.data ? (
        <ErrorState message={getErrorMessage(organizationsQuery.error)} onRetry={() => organizationsQuery.refetch()} minHeight={200} />
      ) : organizationsQuery.data.length === 0 ? (
        <EmptyState message="No organizations yet." minHeight={200} />
      ) : (
        <Stack sx={{ gap: 2 }}>
          {organizationsQuery.data.map((org) => (
            <Card key={org.id}>
              <CardContent>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="h4">{org.name}</Typography>
                  <Chip size="small" label={org.plan} sx={{ backgroundColor: `${PLAN_COLOR[org.plan]}1f`, color: PLAN_COLOR[org.plan] }} />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={org.status}
                    color={org.status === "ACTIVE" ? "success" : "warning"}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  /{org.slug} · {org.timezone} · {org.language}
                  {org.region ? ` · ${org.region}` : ""}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Created {formatDateTime(org.createdAt)}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>New organization</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2, pt: 1 }}>
            <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} autoFocus fullWidth />
            <TextField
              label="Slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              fullWidth
              helperText="Lowercase letters, digits, hyphens only"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!name.trim() || !slug.trim() || createMutation.isPending}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// Wiederverwendet fuer "Plans"-Tab (Auftragspunkt 9) - kein zweiter
// Organisations-Request, nur eine andere Darstellung derselben, bereits
// geladenen Liste.
export function usePlanBreakdown() {
  const organizationsQuery = useOrganizations();
  const breakdown: Record<OrganizationPlan, number> = { FREE: 0, PRO: 0, ENTERPRISE: 0 };
  for (const org of organizationsQuery.data ?? []) {
    breakdown[org.plan]++;
  }
  return { breakdown, isLoading: organizationsQuery.isLoading, isError: organizationsQuery.isError };
}

export { PLAN_COLOR };
