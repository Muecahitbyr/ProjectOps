import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useServices } from "../hooks/useServices";
import {
  useApproveChange,
  useCancelChange,
  useChange,
  useChangeAudit,
  useChangeImpact,
  useChangeMaintenanceWindows,
  useChangeRelatedIncidents,
  useChangeRisk,
  useCompleteChange,
  useDeleteChange,
  useFailChange,
  useRejectChange,
  useReplaceChangeServices,
  useScheduleChange,
  useStartChange,
  useUpdateChange,
} from "../hooks/useChanges";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime } from "../utils/formatters";
import { CHANGE_CATEGORIES, CHANGE_RISKS, CHANGE_TYPES, isApprovalRequiredToStart } from "../types/change.types";
import type { ChangeCategory, ChangeRisk, ChangeType } from "../types/change.types";
import { deriveIncidentStatus } from "../types/incident.types";
import type { ChangeSafetyVerdict } from "../types/change-risk.types";

const TABS = ["Overview", "Risk & Safety", "Services", "Impact", "Maintenance", "Incidents", "Audit"] as const;

const VERDICT_COLOR: Record<ChangeSafetyVerdict, "success" | "warning" | "error"> = {
  SAFE: "success",
  WARNING: "warning",
  BLOCKED: "error",
};

function toIsoOrEmpty(localValue: string): string {
  if (!localValue) return "";
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk" Auftragspunkt 13 "Frontend" - eigene Detail-Route (statt eingebettet
// in Changes.tsx wie OnCall.tsx sein Schedule-Detail behandelt), da ein
// Change deutlich mehr Unteransichten hat (Impact/Wartungsfenster/Incidents,
// Tabs analog zu ServiceDetail.tsx).
export function ChangeDetail() {
  const { id } = useParams<{ id: string }>();
  const changeId = id ? Number(id) : undefined;
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [failReason, setFailReason] = useState("");

  const changeQuery = useChange(changeId);
  const servicesQuery = useServices(changeQuery.data ? { organizationId: changeQuery.data.organizationId } : {});
  const impactQuery = useChangeImpact(changeId, tab === "Impact");
  const maintenanceQuery = useChangeMaintenanceWindows(changeId);
  const incidentsQuery = useChangeRelatedIncidents(changeId);
  const auditQuery = useChangeAudit(tab === "Audit" ? changeId : undefined);
  // Auch ausserhalb des Tabs geladen (nicht nur bei tab === "Risk & Safety")
  // - der Header oben zeigt den Verdict-Chip permanent an, siehe unten.
  const riskQuery = useChangeRisk(changeId);

  const scheduleMutation = useScheduleChange();
  const startMutation = useStartChange();
  const completeMutation = useCompleteChange();
  const failMutation = useFailChange();
  const cancelMutation = useCancelChange();
  const approveMutation = useApproveChange();
  const rejectMutation = useRejectChange();
  const deleteMutation = useDeleteChange();
  const replaceServicesMutation = useReplaceChangeServices();

  if (!changeId) {
    return (
      <PageContainer title="Change">
        <ErrorState message="Invalid change id" />
      </PageContainer>
    );
  }

  if (changeQuery.isLoading) {
    return (
      <PageContainer title="Change">
        <LoadingState label="Loading change..." minHeight={300} />
      </PageContainer>
    );
  }

  if (changeQuery.isError || !changeQuery.data) {
    return (
      <PageContainer title="Change">
        <ErrorState message={getErrorMessage(changeQuery.error)} onRetry={() => changeQuery.refetch()} minHeight={300} />
      </PageContainer>
    );
  }

  const change = changeQuery.data;
  const lifecycleError = scheduleMutation.error ?? startMutation.error ?? completeMutation.error ?? failMutation.error ?? cancelMutation.error;
  const approvalHintNeeded = isApprovalRequiredToStart(change.changeType, change.risk) && change.approvalStatus !== "APPROVED";
  // Auftragspunkt 5 "Change Impact" - "Wenn ein HIGH/CRITICAL Change einen
  // kritischen Service betrifft, soll die UI entsprechend warnen": rein
  // clientseitiger Hinweis auf bereits geladenen Service-Metadaten (keine
  // zusaetzliche Abfrage), analog zur bereits bestehenden Freigabe-
  // Hinweislogik oben (isApprovalRequiredToStart) - nur ein UI-Hinweis,
  // keine Durchsetzung.
  const affectedCriticalServices = (servicesQuery.data ?? []).filter((s) => change.serviceIds.includes(s.id) && s.criticality === "CRITICAL");
  const showCriticalWarning = (change.risk === "HIGH" || change.risk === "CRITICAL") && affectedCriticalServices.length > 0;

  return (
    <PageContainer title={change.title}>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2 }}>
            <Stack sx={{ gap: 1 }}>
              <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                <Chip size="small" label={change.status} color={change.status === "FAILED" ? "error" : change.status === "COMPLETED" ? "success" : "default"} />
                <Chip size="small" label={change.changeType} variant="outlined" />
                <Chip size="small" label={change.category} variant="outlined" />
                <Chip size="small" label={`Risk: ${change.risk}`} color={change.risk === "HIGH" || change.risk === "CRITICAL" ? "warning" : "default"} variant="outlined" />
                {riskQuery.data ? (
                  <Chip
                    size="small"
                    label={`Safety: ${riskQuery.data.verdict} (${riskQuery.data.score}/100)`}
                    color={VERDICT_COLOR[riskQuery.data.verdict]}
                    onClick={() => setTab("Risk & Safety")}
                    clickable
                  />
                ) : null}
                <Chip
                  size="small"
                  label={`Approval: ${change.approvalStatus}`}
                  color={change.approvalStatus === "APPROVED" ? "success" : change.approvalStatus === "REJECTED" ? "error" : "default"}
                  variant="outlined"
                />
              </Stack>
              {change.description ? <Typography variant="body2" color="text.secondary">{change.description}</Typography> : null}
              <Typography variant="body2" color="text.secondary">
                Planned: {change.plannedStartAt ? formatDateTime(change.plannedStartAt) : "-"} &rarr; {change.plannedEndAt ? formatDateTime(change.plannedEndAt) : "-"}
              </Typography>
              {change.actualStartAt ? (
                <Typography variant="body2" color="text.secondary">
                  Actual: {formatDateTime(change.actualStartAt)} &rarr; {change.actualEndAt ? formatDateTime(change.actualEndAt) : "in progress"}
                </Typography>
              ) : null}
              {change.emergencyJustification ? (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Emergency justification: {change.emergencyJustification}
                </Alert>
              ) : null}
              {change.rejectionReason ? <Alert severity="error" sx={{ mt: 1 }}>Rejected: {change.rejectionReason}</Alert> : null}
              {change.failureReason ? <Alert severity="error" sx={{ mt: 1 }}>Failed: {change.failureReason}</Alert> : null}
            </Stack>

            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
              {change.approvalStatus === "PENDING" ? (
                <>
                  <Button size="small" variant="outlined" color="success" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(change.id)}>
                    Approve
                  </Button>
                  <Button size="small" variant="outlined" color="error" onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                </>
              ) : null}
              {(change.status === "DRAFT" || change.status === "SCHEDULED") ? (
                <Button size="small" variant="outlined" onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
              ) : null}
              {change.status === "DRAFT" ? (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!change.plannedStartAt || !change.plannedEndAt || scheduleMutation.isPending}
                  onClick={() => scheduleMutation.mutate(change.id)}
                >
                  Schedule
                </Button>
              ) : null}
              {(change.status === "DRAFT" || change.status === "SCHEDULED") ? (
                <Button size="small" variant="contained" disabled={startMutation.isPending} onClick={() => startMutation.mutate(change.id)}>
                  Start
                </Button>
              ) : null}
              {change.status === "IN_PROGRESS" ? (
                <Button size="small" variant="contained" color="success" disabled={completeMutation.isPending} onClick={() => completeMutation.mutate(change.id)}>
                  Complete
                </Button>
              ) : null}
              {change.status === "IN_PROGRESS" ? (
                <Button size="small" variant="outlined" color="error" onClick={() => setFailOpen(true)}>
                  Mark Failed
                </Button>
              ) : null}
              {(change.status === "DRAFT" || change.status === "SCHEDULED" || change.status === "IN_PROGRESS") ? (
                <Button size="small" variant="outlined" color="error" onClick={() => setCancelOpen(true)}>
                  Cancel
                </Button>
              ) : null}
              {change.status === "DRAFT" ? (
                <Button size="small" color="error" onClick={() => setDeleteOpen(true)}>
                  Delete
                </Button>
              ) : null}
            </Stack>
          </Stack>

          {approvalHintNeeded && (change.status === "DRAFT" || change.status === "SCHEDULED") ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              This change's risk ({change.risk}) requires approval before it can be started.
            </Alert>
          ) : null}
          {showCriticalWarning ? (
            <Alert severity="warning" sx={{ mt: 2 }}>
              This {change.risk.toLowerCase()}-risk change affects {affectedCriticalServices.length} CRITICAL service{affectedCriticalServices.length === 1 ? "" : "s"} (
              {affectedCriticalServices.map((s) => s.name).join(", ")}). Review the Impact tab before starting.
            </Alert>
          ) : null}
          {riskQuery.data?.verdict === "BLOCKED" && (change.status === "DRAFT" || change.status === "SCHEDULED") && change.changeType !== "EMERGENCY" ? (
            <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" size="small" onClick={() => setTab("Risk & Safety")}>Details</Button>}>
              The safety check currently BLOCKS starting this change: {riskQuery.data.blockers.map((b) => b.label).join("; ")}.
            </Alert>
          ) : null}
          {lifecycleError ? <Alert severity="error" sx={{ mt: 2 }}>{getErrorMessage(lifecycleError)}</Alert> : null}
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(_event, value: (typeof TABS)[number]) => setTab(value)}>
          {TABS.map((t) => (
            <Tab key={t} value={t} label={t} />
          ))}
        </Tabs>
      </Card>

      {tab === "Overview" ? (
        <Card>
          <CardContent>
            <Stack sx={{ gap: 2 }}>
              <Stack>
                <Typography variant="overline" color="text.secondary">
                  Risk assessment
                </Typography>
                <Typography variant="body2">{change.riskAssessment ?? "-"}</Typography>
              </Stack>
              <Stack>
                <Typography variant="overline" color="text.secondary">
                  Rollback plan
                </Typography>
                <Typography variant="body2">{change.rollbackPlan ?? "-"}</Typography>
              </Stack>
              <Stack>
                <Typography variant="overline" color="text.secondary">
                  Deployment
                </Typography>
                {change.deployment ? (
                  <Typography variant="body2">
                    {change.deployment.version} ({change.deployment.environment}) - {change.deployment.status} - deployed {formatDateTime(change.deployment.deployedAt)}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No deployment linked.
                  </Typography>
                )}
              </Stack>
              <Stack direction="row" sx={{ gap: 4 }}>
                <Stack>
                  <Typography variant="overline" color="text.secondary">
                    Created
                  </Typography>
                  <Typography variant="body2">{formatDateTime(change.createdAt)}</Typography>
                </Stack>
                <Stack>
                  <Typography variant="overline" color="text.secondary">
                    Updated
                  </Typography>
                  <Typography variant="body2">{formatDateTime(change.updatedAt)}</Typography>
                </Stack>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {tab === "Risk & Safety" ? (
        <Stack sx={{ gap: 2 }}>
          {riskQuery.isLoading ? (
            <Card>
              <CardContent>
                <LoadingState label="Analyzing risk..." minHeight={160} />
              </CardContent>
            </Card>
          ) : riskQuery.isError || !riskQuery.data ? (
            <Card>
              <CardContent>
                <ErrorState message={getErrorMessage(riskQuery.error)} onRetry={() => riskQuery.refetch()} minHeight={160} />
              </CardContent>
            </Card>
          ) : (
            (() => {
              const risk = riskQuery.data;
              return (
                <>
                  <Card>
                    <CardContent>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
                        <Stack direction="row" sx={{ alignItems: "center", gap: 2 }}>
                          <Chip label={risk.verdict} color={VERDICT_COLOR[risk.verdict]} sx={{ fontWeight: "bold", fontSize: "1rem", px: 1 }} />
                          <Typography variant="h4">Risk score: {risk.score} / 100</Typography>
                        </Stack>
                        <Button size="small" onClick={() => riskQuery.refetch()}>
                          Re-analyze
                        </Button>
                      </Stack>
                      {risk.dataGaps.length > 0 ? (
                        <Alert severity="info" sx={{ mt: 2 }}>
                          {risk.dataGaps.map((gap, i) => (
                            <div key={i}>{gap}</div>
                          ))}
                        </Alert>
                      ) : null}
                    </CardContent>
                  </Card>

                  {risk.blockers.length > 0 ? (
                    <Card>
                      <CardContent>
                        <Typography variant="h4" sx={{ mb: 1 }} color="error">
                          Why this change is BLOCKED
                        </Typography>
                        <Stack sx={{ gap: 1.5 }}>
                          {risk.blockers.map((b) => (
                            <Alert key={b.key} severity="error">
                              <strong>{b.label}</strong>
                              <div>{b.detail}</div>
                            </Alert>
                          ))}
                        </Stack>
                      </CardContent>
                    </Card>
                  ) : null}

                  {risk.factors.length > 0 ? (
                    <Card>
                      <CardContent>
                        <Typography variant="h4" sx={{ mb: 2 }}>
                          Contributing factors
                        </Typography>
                        <List disablePadding>
                          {risk.factors.map((f) => (
                            <ListItem key={f.key} disableGutters>
                              <ListItemText primary={`+${f.points} - ${f.label}`} secondary={f.detail} />
                            </ListItem>
                          ))}
                        </List>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent>
                        <Typography variant="body2" color="text.secondary">
                          No risk-increasing factors found - this change is currently a good candidate to proceed.
                        </Typography>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardContent>
                      <Typography variant="h4" sx={{ mb: 2 }}>
                        Blast radius
                      </Typography>
                      <Stack direction="row" sx={{ gap: 4, flexWrap: "wrap" }}>
                        <Stack>
                          <Typography variant="overline" color="text.secondary">Affected services</Typography>
                          <Typography variant="h4">{risk.blastRadius.affectedServiceCount}</Typography>
                        </Stack>
                        <Stack>
                          <Typography variant="overline" color="text.secondary">Max depth</Typography>
                          <Typography variant="h4">{risk.blastRadius.maxDepthReached}</Typography>
                        </Stack>
                        <Stack>
                          <Typography variant="overline" color="text.secondary">SPOF candidates</Typography>
                          <Typography variant="h4">{risk.blastRadius.spofCount}</Typography>
                        </Stack>
                      </Stack>
                      {risk.affectedCriticalServices.length > 0 ? (
                        <Stack sx={{ mt: 2 }}>
                          <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Directly affected CRITICAL services
                          </Typography>
                          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                            {risk.affectedCriticalServices.map((s) => (
                              <Chip key={s.id} size="small" color="error" label={s.name} onClick={() => navigate(`/platform/services/${s.id}`)} clickable />
                            ))}
                          </Stack>
                        </Stack>
                      ) : null}
                    </CardContent>
                  </Card>

                  {risk.openIncidents.length > 0 || risk.atRiskSlos.length > 0 || risk.triggeredAlerts.length > 0 ? (
                    <Card>
                      <CardContent>
                        <Typography variant="h4" sx={{ mb: 2 }}>
                          Related signals
                        </Typography>
                        {risk.openIncidents.length > 0 ? (
                          <Stack sx={{ mb: 2 }}>
                            <Typography variant="subtitle2">Open incidents</Typography>
                            <List disablePadding dense>
                              {risk.openIncidents.map((i) => (
                                <ListItem key={i.id} disableGutters sx={{ cursor: "pointer" }} onClick={() => navigate(`/incidents/${i.id}`)}>
                                  <ListItemText primary={`${i.title} (${i.severity})`} secondary={i.serviceName} />
                                </ListItem>
                              ))}
                            </List>
                          </Stack>
                        ) : null}
                        {risk.atRiskSlos.length > 0 ? (
                          <Stack sx={{ mb: 2 }}>
                            <Typography variant="subtitle2">At-risk SLOs</Typography>
                            <List disablePadding dense>
                              {risk.atRiskSlos.map((s) => (
                                <ListItem key={s.id} disableGutters>
                                  <ListItemText primary={`${s.name} (${s.status})`} secondary={s.serviceName} />
                                </ListItem>
                              ))}
                            </List>
                          </Stack>
                        ) : null}
                        {risk.triggeredAlerts.length > 0 ? (
                          <Stack>
                            <Typography variant="subtitle2">Triggered alerts</Typography>
                            <List disablePadding dense>
                              {risk.triggeredAlerts.map((a) => (
                                <ListItem key={a.id} disableGutters>
                                  <ListItemText primary={a.name} secondary={a.serviceName} />
                                </ListItem>
                              ))}
                            </List>
                          </Stack>
                        ) : null}
                      </CardContent>
                    </Card>
                  ) : null}

                  {risk.recentlyFailedChanges.length > 0 || risk.recentDeployments.length > 0 || risk.activeMaintenanceConflicts.length > 0 || risk.linkedDeployment ? (
                    <Card>
                      <CardContent>
                        <Typography variant="h4" sx={{ mb: 2 }}>
                          Recent activity &amp; conflicts
                        </Typography>
                        {risk.linkedDeployment ? (
                          <Typography variant="body2" sx={{ mb: 1 }}>
                            Linked deployment {risk.linkedDeployment.version}: <strong>{risk.linkedDeployment.status}</strong>
                          </Typography>
                        ) : null}
                        {risk.recentlyFailedChanges.length > 0 ? (
                          <Stack sx={{ mb: 2 }}>
                            <Typography variant="subtitle2">Recently failed changes on the same service(s)</Typography>
                            <List disablePadding dense>
                              {risk.recentlyFailedChanges.map((c) => (
                                <ListItem key={c.id} disableGutters sx={{ cursor: "pointer" }} onClick={() => navigate(`/changes/${c.id}`)}>
                                  <ListItemText primary={c.title} secondary={c.actualEndAt ? formatDateTime(c.actualEndAt) : undefined} />
                                </ListItem>
                              ))}
                            </List>
                          </Stack>
                        ) : null}
                        {risk.recentDeployments.length > 0 ? (
                          <Stack sx={{ mb: 2 }}>
                            <Typography variant="subtitle2">Recent deployments on affected project(s)</Typography>
                            <List disablePadding dense>
                              {risk.recentDeployments.map((d) => (
                                <ListItem key={d.id} disableGutters>
                                  <ListItemText primary={`${d.version} (${d.status})`} secondary={`${d.projectId} - ${formatDateTime(d.deployedAt)}`} />
                                </ListItem>
                              ))}
                            </List>
                          </Stack>
                        ) : null}
                        {risk.activeMaintenanceConflicts.length > 0 ? (
                          <Stack>
                            <Typography variant="subtitle2">Maintenance/deployment conflicts</Typography>
                            <List disablePadding dense>
                              {risk.activeMaintenanceConflicts.map((c, i) => (
                                <ListItem
                                  key={i}
                                  disableGutters
                                  sx={{ cursor: c.conflictingChangeId ? "pointer" : "default" }}
                                  onClick={() => c.conflictingChangeId && navigate(`/changes/${c.conflictingChangeId}`)}
                                >
                                  <ListItemText primary={`${c.projectId}: active maintenance window from change #${c.conflictingChangeId}`} />
                                </ListItem>
                              ))}
                            </List>
                          </Stack>
                        ) : null}
                      </CardContent>
                    </Card>
                  ) : null}
                </>
              );
            })()
          )}
        </Stack>
      ) : null}

      {tab === "Services" ? (
        <Card>
          <CardContent>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Affected Services
            </Typography>
            <TextField
              select
              label="Affected services"
              size="small"
              fullWidth
              value={change.serviceIds}
              onChange={(event) => {
                const ids = (event.target.value as unknown as (string | number)[]).map(Number);
                replaceServicesMutation.mutate({ id: change.id, serviceIds: ids });
              }}
              slotProps={{ select: { multiple: true } }}
            >
              {(servicesQuery.data ?? []).map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
            {replaceServicesMutation.isError ? <Alert severity="error" sx={{ mt: 2 }}>{getErrorMessage(replaceServicesMutation.error)}</Alert> : null}
            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mt: 2 }}>
              {change.serviceIds.map((sid) => {
                const service = (servicesQuery.data ?? []).find((s) => s.id === sid);
                return (
                  <Chip
                    key={sid}
                    size="small"
                    label={service?.name ?? `Service #${sid}`}
                    onClick={() => navigate(`/platform/services/${sid}`)}
                    clickable
                  />
                );
              })}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {tab === "Impact" ? (
        <Card>
          <CardContent>
            {impactQuery.isLoading ? (
              <LoadingState label="Computing impact..." minHeight={160} />
            ) : impactQuery.isError || !impactQuery.data ? (
              <ErrorState message={getErrorMessage(impactQuery.error)} onRetry={() => impactQuery.refetch()} minHeight={160} />
            ) : impactQuery.data.services.length === 0 ? (
              <EmptyState message="No services assigned to this change yet - add services in the Services tab to see impact." minHeight={160} />
            ) : (
              <Stack sx={{ gap: 2 }}>
                {impactQuery.data.services.map(({ service, impact }) => (
                  <Stack key={service.id} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Typography variant="subtitle2">{service.name}</Typography>
                      <Button size="small" onClick={() => navigate(`/platform/services/${service.id}`)}>
                        View full impact
                      </Button>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {impact.summary.text}
                    </Typography>
                    <Stack direction="row" sx={{ gap: 2, mt: 1 }}>
                      <Typography variant="caption">Affected: {impact.affectedServices.length}</Typography>
                      <Typography variant="caption">SPOF candidates: {impact.spofCandidates.length}</Typography>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "Maintenance" ? (
        <Card>
          <CardContent>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Maintenance Windows
            </Typography>
            {maintenanceQuery.isLoading ? (
              <LoadingState minHeight={100} />
            ) : (maintenanceQuery.data ?? []).length === 0 ? (
              <EmptyState message="No maintenance windows yet - one is created automatically when the change is started." minHeight={100} />
            ) : (
              <List disablePadding>
                {(maintenanceQuery.data ?? []).map((w) => (
                  <ListItem key={w.id} disableGutters>
                    <ListItemText
                      primary={`${formatDateTime(w.startsAt)} - ${formatDateTime(w.endsAt)}${w.active ? " (active)" : ""}`}
                      secondary={w.reason}
                    />
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
            <Typography variant="h4" sx={{ mb: 2 }}>
              Related Incidents
            </Typography>
            {incidentsQuery.isLoading ? (
              <LoadingState minHeight={100} />
            ) : (incidentsQuery.data ?? []).length === 0 ? (
              <EmptyState message="No incidents on the affected projects." minHeight={100} />
            ) : (
              <List disablePadding>
                {(incidentsQuery.data ?? []).map((incident) => (
                  <ListItem key={incident.id} disableGutters sx={{ cursor: "pointer" }} onClick={() => navigate(`/incidents/${incident.id}`)}>
                    <ListItemText primary={incident.title} secondary={`${deriveIncidentStatus(incident)} - ${formatDateTime(incident.createdAt)}`} />
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "Audit" ? (
        <Card>
          <CardContent>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Audit Trail
            </Typography>
            {auditQuery.isLoading ? (
              <LoadingState minHeight={100} />
            ) : (auditQuery.data ?? []).length === 0 ? (
              <EmptyState message="No audit entries yet." minHeight={100} />
            ) : (
              <List disablePadding>
                {(auditQuery.data ?? []).map((entry) => (
                  <ListItem key={entry.id} disableGutters>
                    <ListItemText primary={entry.message} secondary={formatDateTime(entry.createdAt)} />
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      ) : null}

      <EditChangeDialog open={editOpen} onClose={() => setEditOpen(false)} change={change} />

      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Change</DialogTitle>
        <DialogContent>
          <TextField label="Reason" size="small" fullWidth sx={{ mt: 1 }} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} multiline minRows={2} required />
          {rejectMutation.isError ? <Alert severity="error" sx={{ mt: 2 }}>{getErrorMessage(rejectMutation.error)}</Alert> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={!rejectReason.trim() || rejectMutation.isPending}
            onClick={() => {
              rejectMutation.mutate(
                { id: change.id, reason: rejectReason.trim() },
                { onSuccess: () => { setRejectOpen(false); setRejectReason(""); } },
              );
            }}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={failOpen} onClose={() => setFailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Mark Change "{change.title}" as Failed</DialogTitle>
        <DialogContent>
          <TextField label="Reason (optional)" size="small" fullWidth sx={{ mt: 1 }} value={failReason} onChange={(event) => setFailReason(event.target.value)} multiline minRows={2} />
          <Alert severity="warning" sx={{ mt: 2 }}>This ends any associated active maintenance window immediately.</Alert>
          {failMutation.isError ? <Alert severity="error" sx={{ mt: 2 }}>{getErrorMessage(failMutation.error)}</Alert> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFailOpen(false)}>Back</Button>
          <Button
            variant="contained"
            color="error"
            disabled={failMutation.isPending}
            onClick={() => {
              failMutation.mutate(
                { id: change.id, ...(failReason.trim() ? { reason: failReason.trim() } : {}) },
                { onSuccess: () => { setFailOpen(false); setFailReason(""); } },
              );
            }}
          >
            Mark Failed
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Cancel Change "{change.title}"?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">This ends any associated active maintenance window immediately.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)}>Back</Button>
          <Button
            variant="contained"
            color="error"
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate({ id: change.id }, { onSuccess: () => setCancelOpen(false) })}
          >
            Cancel Change
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Change "{change.title}"?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">This permanently deletes the draft change. This cannot be undone.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(change.id, { onSuccess: () => navigate("/changes") })}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}

function EditChangeDialog({ open, onClose, change }: { open: boolean; onClose: () => void; change: import("../types/change.types").ChangeWithServices }) {
  const updateMutation = useUpdateChange();
  const [title, setTitle] = useState(change.title);
  const [description, setDescription] = useState(change.description ?? "");
  const [changeType, setChangeType] = useState<ChangeType>(change.changeType);
  const [category, setCategory] = useState<ChangeCategory>(change.category);
  const [risk, setRisk] = useState<ChangeRisk>(change.risk);
  const [riskAssessment, setRiskAssessment] = useState(change.riskAssessment ?? "");
  const [rollbackPlan, setRollbackPlan] = useState(change.rollbackPlan ?? "");
  const [plannedStartAt, setPlannedStartAt] = useState(toLocalInput(change.plannedStartAt));
  const [plannedEndAt, setPlannedEndAt] = useState(toLocalInput(change.plannedEndAt));
  const [emergencyJustification, setEmergencyJustification] = useState(change.emergencyJustification ?? "");

  const plannedStartIso = toIsoOrEmpty(plannedStartAt);
  const plannedEndIso = toIsoOrEmpty(plannedEndAt);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Change</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <TextField label="Title" size="small" value={title} onChange={(event) => setTitle(event.target.value)} required />
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
          {changeType === "EMERGENCY" ? (
            <TextField
              label="Emergency justification"
              size="small"
              value={emergencyJustification}
              onChange={(event) => setEmergencyJustification(event.target.value)}
              multiline
              minRows={2}
              required
            />
          ) : null}
          <TextField label="Risk assessment" size="small" value={riskAssessment} onChange={(event) => setRiskAssessment(event.target.value)} multiline minRows={2} />
          <TextField label="Rollback plan" size="small" value={rollbackPlan} onChange={(event) => setRollbackPlan(event.target.value)} multiline minRows={2} />
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
          {updateMutation.isError ? <Alert severity="error">{getErrorMessage(updateMutation.error)}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!title.trim() || (changeType === "EMERGENCY" && !emergencyJustification.trim()) || updateMutation.isPending}
          onClick={() => {
            updateMutation.mutate(
              {
                id: change.id,
                input: {
                  title: title.trim(),
                  description: description.trim() || null,
                  changeType,
                  category,
                  risk,
                  riskAssessment: riskAssessment.trim() || null,
                  rollbackPlan: rollbackPlan.trim() || null,
                  plannedStartAt: plannedStartIso || null,
                  plannedEndAt: plannedEndIso || null,
                  emergencyJustification: emergencyJustification.trim() || null,
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
