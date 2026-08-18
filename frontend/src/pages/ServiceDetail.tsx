import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { IncidentList } from "../components/dashboard/IncidentList";
import {
  useService,
  useServiceHealth,
  useServiceDependencies,
  useServiceDependents,
  useServiceImpact,
  useServiceCriticalPath,
  useServices,
  useCreateDependency,
  useDeleteDependency,
  useTopology,
} from "../hooks/useServices";
import { useIncidents } from "../hooks/useIncidents";
import { useChangesForService } from "../hooks/useChanges";
import { useSlos } from "../hooks/useSlo";
import { getErrorMessage } from "../utils/getErrorMessage";
import { healthStatusColors } from "../theme/statusColors";
import { formatDateTime } from "../utils/formatters";
import { DEPENDENCY_TYPES, DEPENDENCY_CRITICALITIES } from "../types/service.types";
import type { DependencyType, DependencyCriticality, ServiceHealthStatus, Service } from "../types/service.types";
import { useUpdateService } from "../hooks/useServices";
import { useEscalationPolicies } from "../hooks/useEscalationPolicies";
import { TopologyGraphView } from "../components/platform/TopologyGraphView";

const HEALTH_COLORS: Record<ServiceHealthStatus, string> = {
  HEALTHY: healthStatusColors.healthy,
  DEGRADED: healthStatusColors.warning,
  CRITICAL: healthStatusColors.critical,
  UNKNOWN: "#6b7280",
};

// Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis" -
// eigener Tab statt die bestehende Health-Ansicht weiter zu ueberladen
// (dort blieb bisher nur eine einzeilige Liste "N potenziell betroffen",
// siehe unten). Reihenfolge bewusst direkt nach "Health", da Impact
// inhaltlich eine Vertiefung von "was bedeutet der aktuelle Zustand fuer
// andere Services" ist.
// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk" Auftragspunkt 13 "Service Detail zeigt aktuelle/geplante Changes" -
// eigener Tab, direkt nach "Incidents" (inhaltlich verwandt: beide zeigen
// Ereignisse, die den aktuellen Service-Zustand erklaeren koennen).
const TABS = ["Overview", "Health", "Impact", "SLO", "Dependencies", "Dependents", "Incidents", "Changes"] as const;

// Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
// Intelligence" Auftragspunkt 14 "Service Detail" - "Bestehende APIs
// verwenden, keine zweite Analytics Engine": SLO-/Incident-Tabs nutzen die
// bereits bestehenden Phase-21/22-Hooks (useIncidents/useSlos), gefiltert
// nach dem project_id des Service - keine neue Datenquelle.
export function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [addDependencyOpen, setAddDependencyOpen] = useState(false);
  const [removeDependencyId, setRemoveDependencyId] = useState<string | null>(null);

  const serviceQuery = useService(id);
  const healthQuery = useServiceHealth(id);
  const dependenciesQuery = useServiceDependencies(id);
  const dependentsQuery = useServiceDependents(id);
  const impactQuery = useServiceImpact(id);
  const criticalPathQuery = useServiceCriticalPath(id);
  const deleteDependencyMutation = useDeleteDependency();

  const service = serviceQuery.data;
  const slosQuery = useSlos({ ...(service?.projectId ? { projectId: service.projectId } : {}) }, Boolean(service?.projectId));
  const incidentsQuery = useIncidents({ ...(service?.projectId ? { projectId: service.projectId } : {}), limit: 50 });
  // Reuse des bestehenden Topology-Graphen (Phase 23, TopologyGraphView)
  // fuer die Blast-Radius-/Critical-Path-Visualisierung - kein zweites
  // Graph-UI, nur eine andere `highlightedIds`-Auswahl auf demselben Graphen.
  const topologyQuery = useTopology(service?.organizationId, service?.teamId ?? undefined);
  const changesQuery = useChangesForService(service ? Number(service.id) : undefined);

  const projectNames = useMemo(() => (service?.projectId ? { [service.projectId]: service.projectId } : {}), [service]);

  if (!id) {
    return (
      <PageContainer title="Service">
        <ErrorState message="No service id provided." />
      </PageContainer>
    );
  }
  if (serviceQuery.isLoading) {
    return (
      <PageContainer title="Service">
        <LoadingState label="Loading service..." minHeight={300} />
      </PageContainer>
    );
  }
  if (serviceQuery.isError || !service) {
    return (
      <PageContainer title="Service">
        <ErrorState message={getErrorMessage(serviceQuery.error)} onRetry={() => serviceQuery.refetch()} />
      </PageContainer>
    );
  }

  const health = healthQuery.data;
  const sloAtRisk =
    health?.unhealthyDependencies.some((d) => d.criticality === "CRITICAL") && (slosQuery.data ?? []).length > 0
      ? health.unhealthyDependencies.find((d) => d.criticality === "CRITICAL")
      : undefined;

  return (
    <PageContainer title={service.name}>
      <Stack sx={{ gap: 3 }}>
        <Card>
          <CardContent>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
              <Typography variant="h3">{service.name}</Typography>
              <Chip size="small" label={service.criticality} variant="outlined" />
              <Chip size="small" label={service.environment} variant="outlined" />
              <Chip size="small" label={service.lifecycleStatus} variant="outlined" />
              {health ? <Chip size="small" label={health.status} sx={{ backgroundColor: `${HEALTH_COLORS[health.status]}1f`, color: HEALTH_COLORS[health.status] }} /> : null}
            </Stack>
            {service.description ? (
              <Typography variant="body2" color="text.secondary">
                {service.description}
              </Typography>
            ) : null}
          </CardContent>
        </Card>

        <Tabs value={tab} onChange={(_event, value: (typeof TABS)[number]) => setTab(value)}>
          {TABS.map((t) => (
            <Tab key={t} value={t} label={t} />
          ))}
        </Tabs>

        {tab === "Overview" ? (
          <Card>
            <CardContent>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="overline" color="text.secondary">
                    Organization
                  </Typography>
                  <Typography variant="body2">{service.organizationId}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="overline" color="text.secondary">
                    Team
                  </Typography>
                  <Typography variant="body2">{service.teamId ?? "Unassigned"}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="overline" color="text.secondary">
                    Technical Owner
                  </Typography>
                  <Typography variant="body2">{service.technicalOwnerId ?? "-"}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="overline" color="text.secondary">
                    Business Owner
                  </Typography>
                  <Typography variant="body2">{service.businessOwner ?? "-"}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="overline" color="text.secondary">
                    Linked Project
                  </Typography>
                  <Typography variant="body2">{service.projectId ?? "None (catalog-only)"}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="overline" color="text.secondary">
                    Escalation Policy
                  </Typography>
                  <EscalationPolicySelector service={service} />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        ) : null}

        {tab === "Health" ? (
          <Card>
            <CardContent>
              {healthQuery.isLoading ? (
                <LoadingState minHeight={160} />
              ) : healthQuery.isError || !health ? (
                <ErrorState message={getErrorMessage(healthQuery.error)} minHeight={160} />
              ) : (
                <Stack sx={{ gap: 2 }}>
                  <Stack direction="row" sx={{ gap: 3, flexWrap: "wrap" }}>
                    <Stack>
                      <Typography variant="overline" color="text.secondary">
                        Overall Status
                      </Typography>
                      <Chip label={health.status} sx={{ backgroundColor: `${HEALTH_COLORS[health.status]}1f`, color: HEALTH_COLORS[health.status] }} />
                    </Stack>
                    <Stack>
                      <Typography variant="overline" color="text.secondary">
                        Own Health
                      </Typography>
                      <Chip label={health.ownHealth} variant="outlined" />
                    </Stack>
                    <Stack>
                      <Typography variant="overline" color="text.secondary">
                        Open Incidents
                      </Typography>
                      <Typography variant="body2">{health.openIncidents}</Typography>
                    </Stack>
                  </Stack>

                  {sloAtRisk ? (
                    <Alert severity="warning">
                      SLO at risk because dependency "{sloAtRisk.name}" is {sloAtRisk.status.toLowerCase()}.
                    </Alert>
                  ) : null}

                  {health.reasons.length > 0 ? (
                    <Stack>
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                        Reasons
                      </Typography>
                      {health.reasons.map((reason, i) => (
                        <Typography key={i} variant="body2" color="text.secondary">
                          - {reason}
                        </Typography>
                      ))}
                    </Stack>
                  ) : null}

                  {health.rootCauseCandidates.length > 0 ? (
                    <Alert severity="info">
                      Potential root cause: {health.rootCauseCandidates.map((c) => c.name).join(", ")} (not a definitive diagnosis)
                    </Alert>
                  ) : null}

                  {health.unhealthyDependencies.length > 0 ? (
                    <Stack>
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                        Unhealthy Dependencies
                      </Typography>
                      {health.unhealthyDependencies.map((d) => (
                        <Stack key={d.serviceId} direction="row" sx={{ gap: 1, alignItems: "center" }}>
                          <Typography variant="body2">{d.name}</Typography>
                          <Chip size="small" label={d.criticality} variant="outlined" />
                          <Chip size="small" label={d.status} sx={{ backgroundColor: `${HEALTH_COLORS[d.status]}1f`, color: HEALTH_COLORS[d.status] }} />
                        </Stack>
                      ))}
                    </Stack>
                  ) : null}

                  <Alert severity={impactQuery.data && impactQuery.data.affectedServices.length > 0 ? "info" : "success"} sx={{ cursor: "pointer" }} onClick={() => setTab("Impact")}>
                    {impactQuery.data?.summary.text ?? `${impactQuery.data?.affectedServices.length ?? 0} potentially affected downstream.`} See the Impact tab for full details.
                  </Alert>
                </Stack>
              )}
            </CardContent>
          </Card>
        ) : null}

        {tab === "Impact" ? (
          <Stack sx={{ gap: 2 }}>
            <Card>
              <CardContent>
                {impactQuery.isLoading ? (
                  <LoadingState label="Computing blast radius..." minHeight={160} />
                ) : impactQuery.isError || !impactQuery.data ? (
                  <ErrorState message={getErrorMessage(impactQuery.error)} onRetry={() => impactQuery.refetch()} minHeight={160} />
                ) : (
                  <Stack sx={{ gap: 2 }}>
                    <Alert severity={impactQuery.data.affectedServices.length > 0 ? "warning" : "success"}>{impactQuery.data.summary.text}</Alert>
                    {impactQuery.data.truncated ? (
                      <Alert severity="info">This analysis was capped at {impactQuery.data.maxDepth} dependency levels - the real blast radius may be larger.</Alert>
                    ) : null}

                    <Stack direction="row" sx={{ gap: 3, flexWrap: "wrap" }}>
                      <Stack>
                        <Typography variant="overline" color="text.secondary">
                          Affected Services
                        </Typography>
                        <Typography variant="h4">{impactQuery.data.affectedServices.length}</Typography>
                      </Stack>
                      <Stack>
                        <Typography variant="overline" color="text.secondary">
                          Max Depth Reached
                        </Typography>
                        <Typography variant="h4">{impactQuery.data.summary.maxDepthReached}</Typography>
                      </Stack>
                      <Stack>
                        <Typography variant="overline" color="text.secondary">
                          SPOF Candidates
                        </Typography>
                        <Typography variant="h4">{impactQuery.data.spofCandidates.length}</Typography>
                      </Stack>
                    </Stack>

                    {topologyQuery.data && impactQuery.data.affectedServices.length > 0 ? (
                      <Stack>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          Blast Radius (highlighted on the organization's topology graph)
                        </Typography>
                        <TopologyGraphView
                          nodes={topologyQuery.data.nodes}
                          edges={topologyQuery.data.edges}
                          onSelectNode={(nodeId) => navigate(`/platform/services/${nodeId}`)}
                          highlightedIds={new Set([Number(id), ...impactQuery.data.affectedServices.map((s) => s.id)])}
                        />
                      </Stack>
                    ) : null}

                    <Stack>
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                        Affected Services by Depth
                      </Typography>
                      {impactQuery.data.depthGroups.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No other cataloged service depends on this one.
                        </Typography>
                      ) : (
                        impactQuery.data.depthGroups.map((group) => (
                          <Stack key={group.depth} direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap", mb: 0.5 }}>
                            <Chip size="small" label={`Depth ${group.depth}`} variant="outlined" />
                            {group.services.map((s) => (
                              <Chip
                                key={s.id}
                                size="small"
                                label={s.name}
                                onClick={() => navigate(`/platform/services/${s.id}`)}
                                sx={{ backgroundColor: `${group.depth === 1 ? healthStatusColors.warning : healthStatusColors.critical}1f` }}
                              />
                            ))}
                          </Stack>
                        ))
                      )}
                    </Stack>
                  </Stack>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 2 }}>
                  Critical Cascade Paths
                </Typography>
                {criticalPathQuery.isLoading ? (
                  <LoadingState minHeight={100} />
                ) : criticalPathQuery.isError || !criticalPathQuery.data ? (
                  <ErrorState message={getErrorMessage(criticalPathQuery.error)} minHeight={100} />
                ) : criticalPathQuery.data.criticalPaths.length === 0 ? (
                  <EmptyState message="No all-critical dependency chain found (direct or indirect optional dependencies break the cascade)." minHeight={100} />
                ) : (
                  <Stack sx={{ gap: 1.5 }}>
                    {criticalPathQuery.data.criticalPaths.map((path, i) => (
                      <Stack key={i} direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                        <Chip size="small" label={`${path.length} hop${path.length === 1 ? "" : "s"}`} color="error" variant="outlined" />
                        {path.services.map((node, j) => (
                          <Stack key={node.serviceId} direction="row" sx={{ alignItems: "center", gap: 1 }}>
                            {j > 0 ? <Typography color="text.secondary">&rarr;</Typography> : null}
                            <Chip size="small" label={node.name} onClick={() => navigate(`/platform/services/${node.serviceId}`)} />
                          </Stack>
                        ))}
                      </Stack>
                    ))}
                  </Stack>
                )}

                {criticalPathQuery.data && criticalPathQuery.data.spofCandidates.length > 0 ? (
                  <Stack sx={{ mt: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                      Single Point of Failure Candidates
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                      Heuristic: services with multiple critical dependents in this blast radius. Not a formal guarantee of missing redundancy.
                    </Typography>
                    {criticalPathQuery.data.spofCandidates.map((c) => (
                      <Stack key={c.serviceId} direction="row" sx={{ gap: 1, alignItems: "center" }}>
                        <Chip size="small" label={c.name} onClick={() => navigate(`/platform/services/${c.serviceId}`)} />
                        <Typography variant="body2" color="text.secondary">
                          {c.criticalDependentCount} critical dependent{c.criticalDependentCount === 1 ? "" : "s"}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                ) : null}
              </CardContent>
            </Card>

            {impactQuery.data && (impactQuery.data.related.openIncidents.length > 0 || impactQuery.data.related.atRiskSlos.length > 0 || impactQuery.data.related.triggeredAlerts.length > 0) ? (
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 2 }}>
                    Related Signals in Blast Radius
                  </Typography>
                  <Stack sx={{ gap: 2 }}>
                    {impactQuery.data.related.openIncidents.length > 0 ? (
                      <Stack>
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                          Open Incidents
                        </Typography>
                        {impactQuery.data.related.openIncidents.map((inc) => (
                          <Stack key={inc.id} direction="row" sx={{ gap: 1, alignItems: "center" }}>
                            <Chip size="small" label={inc.severity} variant="outlined" />
                            <Typography variant="body2" sx={{ cursor: "pointer" }} onClick={() => navigate(`/incidents/${inc.id}`)}>
                              {inc.title}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              ({inc.serviceName})
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    ) : null}
                    {impactQuery.data.related.atRiskSlos.length > 0 ? (
                      <Stack>
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                          At-Risk SLOs
                        </Typography>
                        {impactQuery.data.related.atRiskSlos.map((slo) => (
                          <Stack key={slo.id} direction="row" sx={{ gap: 1, alignItems: "center" }}>
                            <Chip size="small" label={slo.status} sx={{ backgroundColor: `${HEALTH_COLORS[slo.status === "PENDING" ? "UNKNOWN" : slo.status]}1f` }} />
                            <Typography variant="body2" sx={{ cursor: "pointer" }} onClick={() => navigate(`/platform/slo/${slo.id}`)}>
                              {slo.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              ({slo.serviceName})
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    ) : null}
                    {impactQuery.data.related.triggeredAlerts.length > 0 ? (
                      <Stack>
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                          Triggered Alerts
                        </Typography>
                        {impactQuery.data.related.triggeredAlerts.map((alert) => (
                          <Stack key={alert.id} direction="row" sx={{ gap: 1, alignItems: "center" }}>
                            <Typography variant="body2">{alert.name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              ({alert.serviceName})
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            ) : null}
          </Stack>
        ) : null}

        {tab === "SLO" ? (
          <Card>
            <CardContent>
              {!service.projectId ? (
                <EmptyState message="This service has no linked project, so no SLOs apply." minHeight={120} />
              ) : slosQuery.isLoading ? (
                <LoadingState minHeight={120} />
              ) : (slosQuery.data ?? []).length === 0 ? (
                <EmptyState message="No SLOs configured for this service's project." minHeight={120} />
              ) : (
                <Stack sx={{ gap: 1 }}>
                  {(slosQuery.data ?? []).map((slo) => (
                    <Stack key={slo.id} direction="row" sx={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => navigate(`/platform/slo/${slo.id}`)}>
                      <Typography variant="body2">{slo.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Target {slo.target}% - {slo.current ? `${slo.current.sliValue}%` : "pending"}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        ) : null}

        {tab === "Dependencies" ? (
          <Card>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", mb: 2 }}>
                <Typography variant="h4">Dependencies</Typography>
                <Button variant="contained" size="small" onClick={() => setAddDependencyOpen(true)}>
                  Add Dependency
                </Button>
              </Stack>
              {dependenciesQuery.isLoading ? (
                <LoadingState minHeight={120} />
              ) : (dependenciesQuery.data ?? []).length === 0 ? (
                <EmptyState message="No dependencies yet." minHeight={120} />
              ) : (
                <List disablePadding>
                  {(dependenciesQuery.data ?? []).map((dep) => (
                    <ListItem
                      key={dep.id}
                      disableGutters
                      secondaryAction={
                        <IconButton edge="end" size="small" onClick={() => setRemoveDependencyId(String(dep.id))}>
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      }
                    >
                      <ListItemText
                        primary={`Service #${dep.targetServiceId} (${dep.dependencyType})`}
                        secondary={`${dep.criticality} - created ${formatDateTime(dep.createdAt)}`}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        ) : null}

        {tab === "Dependents" ? (
          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 2 }}>
                Dependents
              </Typography>
              {dependentsQuery.isLoading ? (
                <LoadingState minHeight={120} />
              ) : (dependentsQuery.data ?? []).length === 0 ? (
                <EmptyState message="No other service depends on this one." minHeight={120} />
              ) : (
                <List disablePadding>
                  {(dependentsQuery.data ?? []).map((dep) => (
                    <ListItem key={dep.id} disableGutters>
                      <ListItemText primary={`Service #${dep.sourceServiceId} depends on this (${dep.dependencyType})`} secondary={dep.criticality} />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        ) : null}

        {tab === "Incidents" ? (
          <Card>
            <CardContent>
              {!service.projectId ? (
                <EmptyState message="This service has no linked project, so no incidents apply." minHeight={120} />
              ) : incidentsQuery.isLoading ? (
                <LoadingState minHeight={120} />
              ) : incidentsQuery.isError ? (
                <ErrorState message={getErrorMessage(incidentsQuery.error)} minHeight={120} />
              ) : (
                <IncidentList incidents={incidentsQuery.data ?? []} projectNames={projectNames} emptyMessage="No incidents for this service." />
              )}
            </CardContent>
          </Card>
        ) : null}

        {tab === "Changes" ? (
          <Card>
            <CardContent>
              {changesQuery.isLoading ? (
                <LoadingState minHeight={120} />
              ) : changesQuery.isError ? (
                <ErrorState message={getErrorMessage(changesQuery.error)} minHeight={120} />
              ) : (changesQuery.data ?? []).length === 0 ? (
                <EmptyState message="No current or planned changes for this service." minHeight={120} />
              ) : (
                <Stack sx={{ gap: 3 }}>
                  {(
                    [
                      { label: "Running", statuses: ["IN_PROGRESS"] },
                      { label: "Planned", statuses: ["DRAFT", "SCHEDULED"] },
                      { label: "Failed", statuses: ["FAILED"] },
                      { label: "Past", statuses: ["COMPLETED", "CANCELLED"] },
                    ] as const
                  ).map(({ label, statuses }) => {
                    const group = (changesQuery.data ?? []).filter((c) => (statuses as readonly string[]).includes(c.status));
                    if (group.length === 0) return null;
                    return (
                      <Stack key={label}>
                        <Typography variant="overline" color="text.secondary">
                          {label} ({group.length})
                        </Typography>
                        <List disablePadding>
                          {group.map((change) => (
                            <ListItem key={change.id} disableGutters sx={{ cursor: "pointer" }} onClick={() => navigate(`/changes/${change.id}`)}>
                              <ListItemText
                                primary={`${change.title} (${change.status})`}
                                secondary={`${change.changeType} / ${change.category} - Risk ${change.risk} - Planned: ${change.plannedStartAt ? formatDateTime(change.plannedStartAt) : "-"}`}
                              />
                            </ListItem>
                          ))}
                        </List>
                      </Stack>
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>
        ) : null}
      </Stack>

      <AddDependencyDialog
        open={addDependencyOpen}
        onClose={() => setAddDependencyOpen(false)}
        sourceServiceId={id}
        organizationId={service.organizationId}
        currentDependencyTargets={new Set((dependenciesQuery.data ?? []).map((d) => d.targetServiceId))}
      />

      <Dialog open={Boolean(removeDependencyId)} onClose={() => setRemoveDependencyId(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Remove this dependency?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">This removes the dependency edge. This cannot be undone.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveDependencyId(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteDependencyMutation.isPending}
            onClick={() => {
              if (removeDependencyId) {
                deleteDependencyMutation.mutate({ serviceId: id, dependencyId: removeDependencyId }, { onSuccess: () => setRemoveDependencyId(null) });
              }
            }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}

// Phase 27 "Enterprise On-Call & Escalation Management" - "Policy einem
// Service-Kontext zuordnen" (siehe Migrationskommentar 0049). Nutzt den
// bereits vorher gebauten, bis dahin ungenutzten useUpdateService()-Hook
// (Phase 23) - eine kleine, gezielte Aenderung statt eines allgemeinen
// "Service bearbeiten"-Formulars, das ausserhalb des Scopes dieser Phase
// liegt (Service-Metadaten wie Name/Criticality/Environment haben bisher
// ueberhaupt keine Bearbeiten-UI, siehe Abschlussbericht "Bekannte
// Einschraenkungen").
function EscalationPolicySelector({ service }: { service: Service }) {
  const policiesQuery = useEscalationPolicies(service.organizationId);
  const updateMutation = useUpdateService();

  return (
    <TextField
      select
      size="small"
      fullWidth
      value={service.escalationPolicyId !== null ? String(service.escalationPolicyId) : ""}
      disabled={updateMutation.isPending}
      onChange={(event) =>
        updateMutation.mutate({
          id: String(service.id),
          input: { escalationPolicyId: event.target.value ? Number(event.target.value) : null },
        })
      }
      sx={{ mt: 0.5, minWidth: 160 }}
    >
      <MenuItem value="">None</MenuItem>
      {(policiesQuery.data ?? []).map((policy) => (
        <MenuItem key={policy.id} value={String(policy.id)}>
          {policy.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

function AddDependencyDialog({
  open,
  onClose,
  sourceServiceId,
  organizationId,
  currentDependencyTargets,
}: {
  open: boolean;
  onClose: () => void;
  sourceServiceId: string;
  organizationId: string;
  currentDependencyTargets: Set<number>;
}) {
  // Phase 25 - echter, vorbestehender Bug (Phase 23), live gefunden: dieser
  // Aufruf war bisher UNGESCOPT (useServices() ohne Filter), was serverseitig
  // die Bootstrap-Pruefung (echter Platform Owner) verlangt und fuer jeden
  // regulaeren Organisationsmitglied mit 403 fehlschlug - "Add Dependency"
  // war fuer diese Nutzer dadurch faktisch kaputt (leere Zielservice-Liste).
  // Blieb bislang unbemerkt, weil die Service-Detailseite vor Phase 25 nur
  // fuer Global Admins ueberhaupt erreichbar war (siehe Sidebar.tsx).
  const allServicesQuery = useServices({ organizationId });
  const createMutation = useCreateDependency();

  const [targetServiceId, setTargetServiceId] = useState("");
  const [dependencyType, setDependencyType] = useState<DependencyType>("API");
  const [criticality, setCriticality] = useState<DependencyCriticality>("CRITICAL");

  const candidates = (allServicesQuery.data ?? []).filter((s) => String(s.id) !== sourceServiceId && !currentDependencyTargets.has(s.id));

  const reset = () => {
    setTargetServiceId("");
    setDependencyType("API");
    setCriticality("CRITICAL");
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Dependency</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <TextField select label="Depends on" size="small" value={targetServiceId} onChange={(event) => setTargetServiceId(event.target.value)} required>
            {candidates.map((s) => (
              <MenuItem key={s.id} value={String(s.id)}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Type" size="small" value={dependencyType} onChange={(event) => setDependencyType(event.target.value as DependencyType)}>
            {DEPENDENCY_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Criticality" size="small" value={criticality} onChange={(event) => setCriticality(event.target.value as DependencyCriticality)}>
            {DEPENDENCY_CRITICALITIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
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
          disabled={!targetServiceId || createMutation.isPending}
          onClick={() => {
            createMutation.mutate(
              { serviceId: sourceServiceId, input: { targetServiceId: Number(targetServiceId), dependencyType, criticality } },
              { onSuccess: () => { reset(); onClose(); } },
            );
          }}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
