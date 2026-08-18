import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
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
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { StatsCard } from "../components/dashboard/StatsCard";
import { useOrganizations } from "../hooks/useOrganizations";
import { useTeams } from "../hooks/useTeams";
import { useProjectsHealth } from "../hooks/useProjects";
import { useSlos, useCreateSlo, useUpdateSlo, useDeleteSlo } from "../hooks/useSlo";
import { getErrorMessage } from "../utils/getErrorMessage";
import { healthStatusColors } from "../theme/statusColors";
import { SLI_TYPES, SLI_TYPE_LABELS } from "../types/slo.types";
import type { SliType, SloStatus, SloWithCurrentStatus } from "../types/slo.types";

const SLO_STATUS_COLORS: Record<SloStatus, string> = {
  HEALTHY: healthStatusColors.healthy,
  DEGRADED: healthStatusColors.warning,
  CRITICAL: healthStatusColors.critical,
};

function statusOf(slo: SloWithCurrentStatus): SloStatus | "PENDING" {
  return slo.current?.errorBudget.status ?? "PENDING";
}

// Stabile Referenz fuer den "noch keine Daten"-Fall, sonst invalidiert ein
// neues `[]` bei jedem Render die untenstehende useMemo-Abhaengigkeit.
const EMPTY_SLOS: SloWithCurrentStatus[] = [];

// Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service Health"
// Auftragspunkt 13 "SLO Frontend" - Kennzahlkarten + Tabelle + Filter, dem
// etablierten Muster von ApiAnalytics.tsx/Incidents.tsx folgend.
export function SloOverview() {
  const navigate = useNavigate();
  // Phase 34 "Enterprise SLO, SLA & Error-Budget Intelligence" - erlaubt ein
  // Deep-Link von der Reliability-Seite (/reliability, Phase 33) direkt auf
  // die SLOs eines bestimmten Projekts, z.B. /platform/slo?projectId=rechno.
  const [searchParams] = useSearchParams();
  const [organizationId, setOrganizationId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState(() => searchParams.get("projectId") ?? "");
  const [statusFilter, setStatusFilter] = useState<"ALL" | SloStatus>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SloWithCurrentStatus | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SloWithCurrentStatus | null>(null);

  const organizationsQuery = useOrganizations();

  // Phase 25 - siehe identischer Kommentar in ServiceCatalog.tsx: die Seite
  // ist seit dieser Phase auch fuer reguläre Organisationsmitglieder
  // verlinkt, "All organizations" als Startzustand wuerde fuer sie sonst
  // einen 403 statt Daten liefern.
  const hasAutoSelectedOrg = useRef(false);
  useEffect(() => {
    if (hasAutoSelectedOrg.current) return;
    const firstOrg = organizationsQuery.data?.[0];
    if (firstOrg) {
      hasAutoSelectedOrg.current = true;
      setOrganizationId(firstOrg.id);
    }
  }, [organizationsQuery.data]);

  const teamsQuery = useTeams(organizationId || undefined);
  const projectsQuery = useProjectsHealth();
  const slosQuery = useSlos({
    ...(organizationId ? { organizationId } : {}),
    ...(teamId ? { teamId } : {}),
    ...(projectId ? { projectId } : {}),
  });
  const deleteMutation = useDeleteSlo();

  const projectNames = useMemo(
    () => Object.fromEntries((projectsQuery.data ?? []).map((p) => [p.id, p.name])),
    [projectsQuery.data],
  );

  const slos = slosQuery.data ?? EMPTY_SLOS;
  const filtered = statusFilter === "ALL" ? slos : slos.filter((s) => statusOf(s) === statusFilter);

  const stats = useMemo(() => {
    let healthy = 0;
    let atRisk = 0;
    let breached = 0;
    for (const slo of slos) {
      const status = statusOf(slo);
      if (status === "CRITICAL") breached++;
      else if (status === "DEGRADED") atRisk++;
      else healthy++;
    }
    return { total: slos.length, healthy, atRisk, breached };
  }, [slos]);

  return (
    <PageContainer title="Service Level Objectives">
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatsCard label="SLOs" value={stats.total} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatsCard label="Healthy" value={stats.healthy} accentColor={healthStatusColors.healthy} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatsCard label="At Risk" value={stats.atRisk} accentColor={healthStatusColors.warning} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatsCard label="Breached" value={stats.breached} accentColor={healthStatusColors.critical} />
        </Grid>
      </Grid>

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
                  setTeamId("");
                }}
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="">All organizations</MenuItem>
                {(organizationsQuery.data ?? []).map((org) => (
                  <MenuItem key={org.id} value={org.id}>
                    {org.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Team"
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                disabled={!organizationId}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="">All teams</MenuItem>
                {(teamsQuery.data ?? []).map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)} sx={{ minWidth: 160 }}>
                <MenuItem value="">All projects</MenuItem>
                {(projectsQuery.data ?? []).map((project) => (
                  <MenuItem key={project.id} value={project.id}>
                    {project.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "ALL" | SloStatus)}
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="ALL">All statuses</MenuItem>
                <MenuItem value="HEALTHY">Healthy</MenuItem>
                <MenuItem value="DEGRADED">Degraded</MenuItem>
                <MenuItem value="CRITICAL">Critical</MenuItem>
              </TextField>
            </Stack>
            <Button variant="contained" onClick={() => setCreateOpen(true)}>
              New SLO
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {slosQuery.isLoading ? (
            <LoadingState label="Loading SLOs..." minHeight={240} />
          ) : slosQuery.isError ? (
            <ErrorState message={getErrorMessage(slosQuery.error)} onRetry={() => slosQuery.refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState message="No SLOs match the current filter." minHeight={240} />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Service</TableCell>
                    <TableCell align="right">Target</TableCell>
                    <TableCell align="right">Current</TableCell>
                    <TableCell align="right">Error Budget</TableCell>
                    <TableCell align="right">Burn Rate</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((slo) => {
                    const status = statusOf(slo);
                    return (
                      <TableRow key={slo.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/platform/slo/${slo.id}`)}>
                        <TableCell>{slo.name}</TableCell>
                        <TableCell>
                          {SLI_TYPE_LABELS[slo.sliType]}
                          {slo.projectId ? ` · ${projectNames[slo.projectId] ?? slo.projectId}` : ""}
                        </TableCell>
                        <TableCell align="right">{slo.target}%</TableCell>
                        <TableCell align="right">{slo.current ? `${slo.current.sliValue}%` : "-"}</TableCell>
                        <TableCell align="right">{slo.current ? `${slo.current.errorBudget.remainingPercentOfBudget}%` : "-"}</TableCell>
                        <TableCell align="right">{slo.current ? `${slo.current.errorBudget.burnRate}x` : "-"}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={status}
                            sx={{
                              backgroundColor: status === "PENDING" ? undefined : `${SLO_STATUS_COLORS[status]}1f`,
                              color: status === "PENDING" ? undefined : SLO_STATUS_COLORS[status],
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditTarget(slo);
                            }}
                          >
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget(slo);
                            }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <CreateSloDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <EditSloDialog slo={editTarget} onClose={() => setEditTarget(null)} />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete SLO "{deleteTarget?.name}"?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">This permanently deletes the SLO and its evaluation history. This cannot be undone.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (deleteTarget) deleteMutation.mutate(String(deleteTarget.id), { onSuccess: () => setDeleteTarget(null) });
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}

function CreateSloDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const organizationsQuery = useOrganizations();
  const projectsQuery = useProjectsHealth();
  const createMutation = useCreateSlo();

  const [organizationId, setOrganizationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [sliType, setSliType] = useState<SliType>("AVAILABILITY");
  const [target, setTarget] = useState("99.9");
  const [latencyThresholdMs, setLatencyThresholdMs] = useState("500");
  const [windowDays, setWindowDays] = useState("30");

  const requiresProject = sliType === "AVAILABILITY" || sliType === "ERROR_RATE" || sliType === "LATENCY";

  const reset = () => {
    setOrganizationId("");
    setProjectId("");
    setName("");
    setSliType("AVAILABILITY");
    setTarget("99.9");
    setLatencyThresholdMs("500");
    setWindowDays("30");
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New SLO</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <TextField select label="Organization" size="small" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} required>
            {(organizationsQuery.data ?? []).map((org) => (
              <MenuItem key={org.id} value={org.id}>
                {org.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Name" size="small" value={name} onChange={(event) => setName(event.target.value)} required />
          <TextField select label="SLI Type" size="small" value={sliType} onChange={(event) => setSliType(event.target.value as SliType)}>
            {SLI_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {SLI_TYPE_LABELS[type]}
              </MenuItem>
            ))}
          </TextField>
          {requiresProject ? (
            <TextField select label="Project" size="small" value={projectId} onChange={(event) => setProjectId(event.target.value)} required>
              {(projectsQuery.data ?? []).map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          <TextField
            label="Target (%)"
            size="small"
            type="number"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            slotProps={{ htmlInput: { min: 0.01, max: 100, step: 0.01 } }}
          />
          {sliType === "LATENCY" ? (
            <TextField
              label="Latency threshold (ms)"
              size="small"
              type="number"
              value={latencyThresholdMs}
              onChange={(event) => setLatencyThresholdMs(event.target.value)}
            />
          ) : null}
          <TextField label="Window (days)" size="small" type="number" value={windowDays} onChange={(event) => setWindowDays(event.target.value)} />
          {createMutation.isError ? <Alert severity="error">{getErrorMessage(createMutation.error)}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            reset();
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!organizationId || !name.trim() || (requiresProject && !projectId) || createMutation.isPending}
          onClick={() => {
            createMutation.mutate(
              {
                organizationId,
                name: name.trim(),
                sliType,
                target: Number(target),
                ...(requiresProject ? { projectId } : {}),
                ...(sliType === "LATENCY" ? { latencyThresholdMs: Number(latencyThresholdMs) } : {}),
                windowDays: Number(windowDays),
              },
              {
                onSuccess: () => {
                  reset();
                  onClose();
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

// Phase 34 "Enterprise SLO, SLA & Error-Budget Intelligence" Auftragspunkt
// 11 "SLO CRUD" - der PATCH-Endpoint und useUpdateSlo() existierten bereits
// seit Phase 22, waren aber nie an eine UI angebunden (echte, kleine
// Luecke). sliType/organizationId/projectId/checkId sind bewusst NICHT
// editierbar (PATCH /platform/slo/:id erlaubt sie serverseitig ohnehin
// nicht, siehe updateSloSchema in routes/platform-slo.routes.ts - eine
// nachtraegliche Scope-/Typ-Aenderung wuerde historische slo_evaluations-
// Snapshots fachlich falsch einordnen).
// Exportiert, damit SloDetail.tsx denselben Dialog wiederverwenden kann
// (kein zweiter, abweichender Edit-Dialog fuer dieselbe Mutation).
export function EditSloDialog({ slo, onClose }: { slo: SloWithCurrentStatus | null; onClose: () => void }) {
  const updateMutation = useUpdateSlo();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("");
  const [latencyThresholdMs, setLatencyThresholdMs] = useState("");
  const [windowDays, setWindowDays] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!slo) return;
    setName(slo.name);
    setDescription(slo.description ?? "");
    setTarget(String(slo.target));
    setLatencyThresholdMs(slo.latencyThresholdMs !== null ? String(slo.latencyThresholdMs) : "");
    setWindowDays(String(slo.windowDays));
    setEnabled(slo.enabled);
    updateMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slo]);

  if (!slo) return null;

  const canSubmit = Boolean(name.trim()) && Number(target) > 0 && Number(target) <= 100 && Number(windowDays) > 0 && !updateMutation.isPending;

  return (
    <Dialog open={Boolean(slo)} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit SLO "{slo.name}"</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <TextField label="Name" size="small" value={name} onChange={(event) => setName(event.target.value)} required />
          <TextField label="Description" size="small" value={description} onChange={(event) => setDescription(event.target.value)} multiline minRows={2} />
          <TextField
            label="Target (%)"
            size="small"
            type="number"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            slotProps={{ htmlInput: { min: 0.01, max: 100, step: 0.01 } }}
          />
          {slo.sliType === "LATENCY" ? (
            <TextField
              label="Latency threshold (ms)"
              size="small"
              type="number"
              value={latencyThresholdMs}
              onChange={(event) => setLatencyThresholdMs(event.target.value)}
            />
          ) : null}
          <TextField label="Window (days)" size="small" type="number" value={windowDays} onChange={(event) => setWindowDays(event.target.value)} />
          <FormControlLabel control={<Switch checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />} label={enabled ? "Enabled" : "Disabled"} />
          {updateMutation.isError ? <Alert severity="error">{getErrorMessage(updateMutation.error)}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() => {
            updateMutation.mutate(
              {
                id: String(slo.id),
                input: {
                  name: name.trim(),
                  description: description.trim() ? description.trim() : null,
                  target: Number(target),
                  ...(slo.sliType === "LATENCY" ? { latencyThresholdMs: Number(latencyThresholdMs) } : {}),
                  windowDays: Number(windowDays),
                  enabled,
                },
              },
              { onSuccess: () => onClose() },
            );
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
