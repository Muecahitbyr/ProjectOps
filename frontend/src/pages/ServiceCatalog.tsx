import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { StatsCard } from "../components/dashboard/StatsCard";
import { useOrganizations } from "../hooks/useOrganizations";
import { useTeams } from "../hooks/useTeams";
import { useProjectsHealth } from "../hooks/useProjects";
import { useServices, useCreateService, useDeleteService } from "../hooks/useServices";
import { getErrorMessage } from "../utils/getErrorMessage";
import { healthStatusColors } from "../theme/statusColors";
import { SERVICE_CRITICALITIES, SERVICE_ENVIRONMENTS, SERVICE_LIFECYCLE_STATUSES } from "../types/service.types";
import type { ServiceCriticality, ServiceEnvironment, ServiceHealthStatus, ServiceLifecycleStatus, ServiceWithHealth } from "../types/service.types";

const HEALTH_COLORS: Record<ServiceHealthStatus, string> = {
  HEALTHY: healthStatusColors.healthy,
  DEGRADED: healthStatusColors.warning,
  CRITICAL: healthStatusColors.critical,
  UNKNOWN: "#6b7280",
};

const CRITICALITY_COLORS: Record<ServiceCriticality, string> = {
  LOW: "#60a5fa",
  MEDIUM: healthStatusColors.warning,
  HIGH: "#f97316",
  CRITICAL: healthStatusColors.critical,
};

const EMPTY_SERVICES: ServiceWithHealth[] = [];

// Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
// Intelligence" Auftragspunkt 13 "Service Catalog UI".
export function ServiceCatalog() {
  const navigate = useNavigate();
  const [organizationId, setOrganizationId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [criticality, setCriticality] = useState<"ALL" | ServiceCriticality>("ALL");
  const [environment, setEnvironment] = useState<"ALL" | ServiceEnvironment>("ALL");
  const [lifecycleStatus, setLifecycleStatus] = useState<"ALL" | ServiceLifecycleStatus>("ALL");
  const [healthFilter, setHealthFilter] = useState<"ALL" | ServiceHealthStatus>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceWithHealth | null>(null);

  const organizationsQuery = useOrganizations();

  // Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis" -
  // seit dieser Phase ist die Seite auch fuer reguläre Organisationsmitglieder
  // verlinkt (siehe components/layout/Sidebar.tsx), nicht mehr nur fuer
  // Global Admins. Ohne organizationId-Filter verlangt das Backend jedoch
  // echten Platform Owner (Bootstrap-Uebersicht, middleware/authorize.ts) -
  // "All organizations" als Startzustand liesse die Seite fuer die meisten
  // legitimen Nutzer mit einem 403 statt Daten starten (identisches, zuerst
  // in OnCall.tsx/Phase 24 gefundenes Muster). Waehlt daher EINMALIG die
  // erste sichtbare Organisation vor.
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
  const servicesQuery = useServices({
    ...(organizationId ? { organizationId } : {}),
    ...(teamId ? { teamId } : {}),
    ...(criticality !== "ALL" ? { criticality } : {}),
    ...(environment !== "ALL" ? { environment } : {}),
    ...(lifecycleStatus !== "ALL" ? { lifecycleStatus } : {}),
    ...(healthFilter !== "ALL" ? { health: healthFilter } : {}),
  });
  const deleteMutation = useDeleteService();

  const services = servicesQuery.data ?? EMPTY_SERVICES;

  const stats = useMemo(() => {
    let healthy = 0;
    let degraded = 0;
    let critical = 0;
    for (const s of services) {
      if (s.health.status === "CRITICAL") critical++;
      else if (s.health.status === "DEGRADED") degraded++;
      else if (s.health.status === "HEALTHY") healthy++;
    }
    return { total: services.length, healthy, degraded, critical };
  }, [services]);

  return (
    <PageContainer title="Service Catalog">
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatsCard label="Services" value={stats.total} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatsCard label="Healthy" value={stats.healthy} accentColor={healthStatusColors.healthy} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatsCard label="Degraded" value={stats.degraded} accentColor={healthStatusColors.warning} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatsCard label="Critical" value={stats.critical} accentColor={healthStatusColors.critical} />
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
              <TextField select size="small" label="Team" value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={!organizationId} sx={{ minWidth: 160 }}>
                <MenuItem value="">All teams</MenuItem>
                {(teamsQuery.data ?? []).map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Criticality" value={criticality} onChange={(event) => setCriticality(event.target.value as "ALL" | ServiceCriticality)} sx={{ minWidth: 140 }}>
                <MenuItem value="ALL">All criticalities</MenuItem>
                {SERVICE_CRITICALITIES.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Environment" value={environment} onChange={(event) => setEnvironment(event.target.value as "ALL" | ServiceEnvironment)} sx={{ minWidth: 150 }}>
                <MenuItem value="ALL">All environments</MenuItem>
                {SERVICE_ENVIRONMENTS.map((e) => (
                  <MenuItem key={e} value={e}>
                    {e}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Lifecycle" value={lifecycleStatus} onChange={(event) => setLifecycleStatus(event.target.value as "ALL" | ServiceLifecycleStatus)} sx={{ minWidth: 140 }}>
                <MenuItem value="ALL">All statuses</MenuItem>
                {SERVICE_LIFECYCLE_STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Health" value={healthFilter} onChange={(event) => setHealthFilter(event.target.value as "ALL" | ServiceHealthStatus)} sx={{ minWidth: 140 }}>
                <MenuItem value="ALL">All health</MenuItem>
                <MenuItem value="HEALTHY">Healthy</MenuItem>
                <MenuItem value="DEGRADED">Degraded</MenuItem>
                <MenuItem value="CRITICAL">Critical</MenuItem>
                <MenuItem value="UNKNOWN">Unknown</MenuItem>
              </TextField>
            </Stack>
            <Stack direction="row" sx={{ gap: 1 }}>
              {/* Phase 48 "Enterprise Service Portfolio & Strategic Lifecycle Intelligence". */}
              <Button variant="outlined" onClick={() => navigate("/platform/services/portfolio")}>
                Portfolio View
              </Button>
              <Button variant="contained" onClick={() => setCreateOpen(true)}>
                New Service
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {servicesQuery.isLoading ? (
            <LoadingState label="Loading services..." minHeight={240} />
          ) : servicesQuery.isError ? (
            <ErrorState message={getErrorMessage(servicesQuery.error)} onRetry={() => servicesQuery.refetch()} />
          ) : services.length === 0 ? (
            <EmptyState message="No services match the current filter." minHeight={240} />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Service</TableCell>
                    <TableCell>Team</TableCell>
                    <TableCell>Criticality</TableCell>
                    <TableCell>Environment</TableCell>
                    <TableCell>Lifecycle</TableCell>
                    <TableCell>Health</TableCell>
                    <TableCell align="right">Open Incidents</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {services.map((service) => (
                    <TableRow key={service.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/platform/services/${service.id}`)}>
                      <TableCell>
                        <Stack>
                          <span>{service.name}</span>
                          {service.technicalOwnerId ? (
                            <span style={{ fontSize: 12, opacity: 0.6 }}>Owner: {service.technicalOwnerId}</span>
                          ) : null}
                        </Stack>
                      </TableCell>
                      <TableCell>{service.teamId ?? "-"}</TableCell>
                      <TableCell>
                        <Chip size="small" label={service.criticality} sx={{ backgroundColor: `${CRITICALITY_COLORS[service.criticality]}1f`, color: CRITICALITY_COLORS[service.criticality] }} />
                      </TableCell>
                      <TableCell>{service.environment}</TableCell>
                      <TableCell>{service.lifecycleStatus}</TableCell>
                      <TableCell>
                        <Chip size="small" label={service.health.status} sx={{ backgroundColor: `${HEALTH_COLORS[service.health.status]}1f`, color: HEALTH_COLORS[service.health.status] }} />
                      </TableCell>
                      <TableCell align="right">{service.health.openIncidents}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget(service);
                          }}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <CreateServiceDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete service "{deleteTarget?.name}"?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">This permanently deletes the service and its dependency edges. This cannot be undone.</Alert>
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

function CreateServiceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const organizationsQuery = useOrganizations();
  const projectsQuery = useProjectsHealth();
  const createMutation = useCreateService();

  const [organizationId, setOrganizationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [criticality, setCriticality] = useState<ServiceCriticality>("MEDIUM");
  const [environment, setEnvironment] = useState<ServiceEnvironment>("PRODUCTION");

  const reset = () => {
    setOrganizationId("");
    setProjectId("");
    setName("");
    setCriticality("MEDIUM");
    setEnvironment("PRODUCTION");
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Service</DialogTitle>
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
          <TextField select label="Linked Project (optional)" size="small" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <MenuItem value="">None (external / catalog-only)</MenuItem>
            {(projectsQuery.data ?? []).map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Criticality" size="small" value={criticality} onChange={(event) => setCriticality(event.target.value as ServiceCriticality)}>
            {SERVICE_CRITICALITIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Environment" size="small" value={environment} onChange={(event) => setEnvironment(event.target.value as ServiceEnvironment)}>
            {SERVICE_ENVIRONMENTS.map((e) => (
              <MenuItem key={e} value={e}>
                {e}
              </MenuItem>
            ))}
          </TextField>
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
          disabled={!organizationId || !name.trim() || createMutation.isPending}
          onClick={() => {
            createMutation.mutate(
              { organizationId, name: name.trim(), criticality, environment, ...(projectId ? { projectId } : {}) },
              { onSuccess: () => { reset(); onClose(); } },
            );
          }}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
