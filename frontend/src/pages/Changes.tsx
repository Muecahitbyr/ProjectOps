import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useOrganizations } from "../hooks/useOrganizations";
import { useServices } from "../hooks/useServices";
import { useUsers } from "../hooks/useUsers";
import { useChanges, useCreateChange } from "../hooks/useChanges";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime } from "../utils/formatters";
import { CHANGE_CATEGORIES, CHANGE_RISKS, CHANGE_STATUSES, CHANGE_TYPES } from "../types/change.types";
import type { ChangeCategory, ChangeRisk, ChangeStatus, ChangeType } from "../types/change.types";

const RISK_COLOR: Record<ChangeRisk, "default" | "warning" | "error" | "success"> = {
  LOW: "success",
  MEDIUM: "default",
  HIGH: "warning",
  CRITICAL: "error",
};

const STATUS_COLOR: Record<ChangeStatus, "default" | "info" | "warning" | "success" | "error"> = {
  DRAFT: "default",
  SCHEDULED: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "error",
  FAILED: "error",
};

function toIsoOrEmpty(localValue: string): string {
  if (!localValue) return "";
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk" Auftragspunkt 13 "Frontend" - dieselbe Grundstruktur wie OnCall.tsx
// (Phase 24): Organisations-/Filterleiste + Tabelle + Create-Dialog, Detail
// auf eigener Route (/changes/:id) statt eingebettet, da ein Change deutlich
// mehr Unteransichten hat (Impact, Wartungsfenster, verknuepfte Incidents).
export function Changes() {
  const [organizationId, setOrganizationId] = useState("");
  const [status, setStatus] = useState<ChangeStatus | "ALL">("ALL");
  const [risk, setRisk] = useState<ChangeRisk | "ALL">("ALL");
  const [changeType, setChangeType] = useState<ChangeType | "ALL">("ALL");
  const [category, setCategory] = useState<ChangeCategory | "ALL">("ALL");
  const [serviceId, setServiceId] = useState<number | "ALL">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const organizationsQuery = useOrganizations();
  const servicesQuery = useServices(organizationId ? { organizationId } : {});

  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current) return;
    const firstOrg = organizationsQuery.data?.[0];
    if (firstOrg) {
      hasAutoSelected.current = true;
      setOrganizationId(firstOrg.id);
    }
  }, [organizationsQuery.data]);

  const changesQuery = useChanges(
    {
      organizationId,
      ...(status !== "ALL" ? { status } : {}),
      ...(risk !== "ALL" ? { risk } : {}),
      ...(changeType !== "ALL" ? { changeType } : {}),
      ...(category !== "ALL" ? { category } : {}),
      ...(serviceId !== "ALL" ? { serviceId } : {}),
      ...(toIsoOrEmpty(from) ? { from: toIsoOrEmpty(from) } : {}),
      ...(toIsoOrEmpty(to) ? { to: toIsoOrEmpty(to) } : {}),
    },
    Boolean(organizationId),
  );

  const changes = changesQuery.data ?? [];

  return (
    <PageContainer title="Changes">
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 2, justifyContent: "space-between" }}>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
              <TextField
                select
                size="small"
                label="Organization"
                value={organizationId}
                onChange={(event) => {
                  setOrganizationId(event.target.value);
                  setServiceId("ALL");
                }}
                sx={{ minWidth: 200 }}
              >
                {(organizationsQuery.data ?? []).map((org) => (
                  <MenuItem key={org.id} value={org.id}>
                    {org.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Status" value={status} onChange={(event) => setStatus(event.target.value as ChangeStatus | "ALL")} sx={{ minWidth: 150 }}>
                <MenuItem value="ALL">All statuses</MenuItem>
                {CHANGE_STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Risk" value={risk} onChange={(event) => setRisk(event.target.value as ChangeRisk | "ALL")} sx={{ minWidth: 130 }}>
                <MenuItem value="ALL">All risks</MenuItem>
                {CHANGE_RISKS.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Type" value={changeType} onChange={(event) => setChangeType(event.target.value as ChangeType | "ALL")} sx={{ minWidth: 140 }}>
                <MenuItem value="ALL">All types</MenuItem>
                {CHANGE_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Category" value={category} onChange={(event) => setCategory(event.target.value as ChangeCategory | "ALL")} sx={{ minWidth: 160 }}>
                <MenuItem value="ALL">All categories</MenuItem>
                {CHANGE_CATEGORIES.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Service"
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value === "ALL" ? "ALL" : Number(event.target.value))}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="ALL">All services</MenuItem>
                {(servicesQuery.data ?? []).map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="From"
                type="datetime-local"
                size="small"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="To"
                type="datetime-local"
                size="small"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
            <Button variant="contained" onClick={() => setCreateOpen(true)} disabled={!organizationId}>
              New Change
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {!organizationId ? (
            <EmptyState message="Select an organization to view its changes." minHeight={200} />
          ) : changesQuery.isLoading ? (
            <LoadingState label="Loading changes..." minHeight={300} />
          ) : changesQuery.isError ? (
            <ErrorState message={getErrorMessage(changesQuery.error)} onRetry={() => changesQuery.refetch()} minHeight={300} />
          ) : changes.length === 0 ? (
            <EmptyState message="No changes match the current filter." minHeight={300} />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Title</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Risk</TableCell>
                    <TableCell>Approval</TableCell>
                    <TableCell>Planned Start</TableCell>
                    <TableCell>Planned End</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {changes.map((change) => (
                    <TableRow key={change.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/changes/${change.id}`)}>
                      <TableCell>{change.title}</TableCell>
                      <TableCell>{change.changeType}</TableCell>
                      <TableCell>{change.category}</TableCell>
                      <TableCell>
                        <Chip size="small" label={change.status} color={STATUS_COLOR[change.status]} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={change.risk} color={RISK_COLOR[change.risk]} variant="outlined" />
                      </TableCell>
                      <TableCell>{change.approvalStatus}</TableCell>
                      <TableCell>{change.plannedStartAt ? formatDateTime(change.plannedStartAt) : "-"}</TableCell>
                      <TableCell>{change.plannedEndAt ? formatDateTime(change.plannedEndAt) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <CreateChangeDialog open={createOpen} onClose={() => setCreateOpen(false)} organizationId={organizationId} onCreated={(id) => navigate(`/changes/${id}`)} />
    </PageContainer>
  );
}

function CreateChangeDialog({
  open,
  onClose,
  organizationId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  onCreated: (id: number) => void;
}) {
  const createMutation = useCreateChange();
  const servicesQuery = useServices(organizationId ? { organizationId } : {});
  const usersQuery = useUsers();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [changeType, setChangeType] = useState<ChangeType>("STANDARD");
  const [category, setCategory] = useState<ChangeCategory>("OTHER");
  const [risk, setRisk] = useState<ChangeRisk>("LOW");
  const [riskAssessment, setRiskAssessment] = useState("");
  const [rollbackPlan, setRollbackPlan] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [plannedStartAt, setPlannedStartAt] = useState("");
  const [plannedEndAt, setPlannedEndAt] = useState("");
  const [emergencyJustification, setEmergencyJustification] = useState("");
  const [serviceIds, setServiceIds] = useState<number[]>([]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setChangeType("STANDARD");
    setCategory("OTHER");
    setRisk("LOW");
    setRiskAssessment("");
    setRollbackPlan("");
    setOwnerId("");
    setPlannedStartAt("");
    setPlannedEndAt("");
    setEmergencyJustification("");
    setServiceIds([]);
    createMutation.reset();
  };

  const plannedStartIso = toIsoOrEmpty(plannedStartAt);
  const plannedEndIso = toIsoOrEmpty(plannedEndAt);
  const canSubmit =
    Boolean(title.trim()) &&
    (changeType !== "EMERGENCY" || Boolean(emergencyJustification.trim())) &&
    (!plannedStartAt || plannedStartIso) &&
    (!plannedEndAt || plannedEndIso) &&
    !createMutation.isPending;

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} maxWidth="sm" fullWidth>
      <DialogTitle>New Change</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <TextField label="Title" size="small" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
          <TextField label="Description" size="small" value={description} onChange={(event) => setDescription(event.target.value)} multiline minRows={2} />
          <Stack direction="row" sx={{ gap: 2 }}>
            <TextField select label="Type" size="small" value={changeType} onChange={(event) => setChangeType(event.target.value as ChangeType)} fullWidth>
              {CHANGE_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Risk" size="small" value={risk} onChange={(event) => setRisk(event.target.value as ChangeRisk)} fullWidth>
              {CHANGE_RISKS.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField select label="Category" size="small" value={category} onChange={(event) => setCategory(event.target.value as ChangeCategory)}>
            {CHANGE_CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
          {(risk === "HIGH" || risk === "CRITICAL") && changeType !== "EMERGENCY" ? (
            <Alert severity="info">This risk level requires approval before the change can be started.</Alert>
          ) : null}
          {changeType === "EMERGENCY" ? (
            <TextField
              label="Emergency justification"
              size="small"
              value={emergencyJustification}
              onChange={(event) => setEmergencyJustification(event.target.value)}
              multiline
              minRows={2}
              required
              helperText="Required for emergency changes - bypasses normal approval but is fully audited."
            />
          ) : null}
          <TextField label="Risk assessment" size="small" value={riskAssessment} onChange={(event) => setRiskAssessment(event.target.value)} multiline minRows={2} />
          <TextField label="Rollback plan" size="small" value={rollbackPlan} onChange={(event) => setRollbackPlan(event.target.value)} multiline minRows={2} />
          <TextField select label="Owner (optional)" size="small" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
            <MenuItem value="">Unassigned</MenuItem>
            {(usersQuery.data ?? []).map((user) => (
              <MenuItem key={user.id} value={user.id}>
                {user.name}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" sx={{ gap: 2 }}>
            <TextField
              label="Planned start"
              type="datetime-local"
              size="small"
              value={plannedStartAt}
              onChange={(event) => setPlannedStartAt(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="Planned end"
              type="datetime-local"
              size="small"
              value={plannedEndAt}
              onChange={(event) => setPlannedEndAt(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          </Stack>
          <TextField
            select
            label="Affected services"
            size="small"
            value={serviceIds}
            onChange={(event) => setServiceIds((event.target.value as unknown as (string | number)[]).map(Number))}
            slotProps={{ select: { multiple: true } }}
          >
            {(servicesQuery.data ?? []).map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
          {createMutation.isError ? <Alert severity="error">{getErrorMessage(createMutation.error)}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() => {
            createMutation.mutate(
              {
                organizationId,
                title: title.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
                changeType,
                category,
                risk,
                ...(riskAssessment.trim() ? { riskAssessment: riskAssessment.trim() } : {}),
                ...(rollbackPlan.trim() ? { rollbackPlan: rollbackPlan.trim() } : {}),
                ...(ownerId ? { ownerId } : {}),
                ...(plannedStartIso ? { plannedStartAt: plannedStartIso } : {}),
                ...(plannedEndIso ? { plannedEndAt: plannedEndIso } : {}),
                ...(emergencyJustification.trim() ? { emergencyJustification: emergencyJustification.trim() } : {}),
                ...(serviceIds.length > 0 ? { serviceIds } : {}),
              },
              {
                onSuccess: (created) => {
                  reset();
                  onClose();
                  onCreated(created.id);
                },
              },
            );
          }}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
