import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import Grid from "@mui/material/Grid";
import DeleteIcon from "@mui/icons-material/Delete";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import MenuItem from "@mui/material/MenuItem";
import {
  useIncident,
  useIncidentTimeline,
  useAcknowledgeIncident,
  useResolveIncident,
  useReopenIncident,
  useCommentOnIncident,
  useAssignIncident,
} from "../hooks/useIncidents";
import { useProjectsHealth } from "../hooks/useProjects";
import { useOrganizations, useOrganizationMembers } from "../hooks/useOrganizations";
import { useTeams } from "../hooks/useTeams";
import { useOnCallSchedules, useCurrentOnCall } from "../hooks/useOnCall";
import { useServices, useServiceImpact } from "../hooks/useServices";
import { useRecentDeploymentsForIncident } from "../hooks/useDeployments";
import { useIncidentChangeContext, useRecentChangesForIncident } from "../hooks/useChanges";
import { useIncidentEscalationStatus } from "../hooks/useEscalationPolicies";
import { useExecuteRecoveryAction, useIncidentRecoveryActions } from "../hooks/useRecovery";
import { useCreateIncidentCommunication, useIncidentCommunications } from "../hooks/useIncidentCommunications";
import { COMMUNICATION_SEVERITIES } from "../types/incident-communication.types";
import type { CommunicationSeverity, NotificationChannelId } from "../types/incident-communication.types";
import {
  useCreateActionItem,
  useCreatePostmortem,
  useDeleteActionItem,
  useIncidentPostmortem,
  usePublishPostmortem,
  useUpdateActionItem,
  useUpdatePostmortem,
} from "../hooks/usePostmortems";
import { useAuth } from "../auth/AuthContext";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime, formatDuration } from "../utils/formatters";
import { severityColors, severityLabels } from "../theme/statusColors";
import { deriveIncidentStatus } from "../types/incident.types";
import type { Incident, IncidentStatus, IncidentTimelineEventType } from "../types/incident.types";
import { ACTION_ITEM_STATUSES } from "../types/postmortem.types";
import type { ActionItemStatus, PostmortemWithActionItems } from "../types/postmortem.types";

const STATUS_COLOR: Record<IncidentStatus, string> = {
  OPEN: severityColors.CRITICAL,
  ACKNOWLEDGED: severityColors.MEDIUM,
  RESOLVED: severityColors.LOW,
};

const TIMELINE_LABELS: Record<IncidentTimelineEventType, string> = {
  CREATED: "Created",
  ALERT_TRIGGERED: "Alert triggered",
  NOTIFICATION_SENT: "Notification",
  ACKNOWLEDGED: "Acknowledged",
  AUTOMATION_STARTED: "Automation started",
  AUTOMATION_SUCCEEDED: "Automation succeeded",
  AUTOMATION_FAILED: "Automation failed",
  RESOLVED: "Resolved",
  REOPENED: "Reopened",
  COMMENTED: "Comment",
  ASSIGNED: "Assigned",
  COMMAND_UPDATED: "Command update",
};

// Phase 21 "Enterprise Alerting, Incident Response & Notification
// Orchestration" Auftragspunkt 13 "Incident Detail Page" - Timeline/
// Notifications/Automation-Attempts sind bereits VEREINT in
// incident_timeline_events (Backend), keine drei getrennten Abschnitte
// noetig - die eventType-Spalte unterscheidet sie.
export function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [resolutionReason, setResolutionReason] = useState("");
  const [commentText, setCommentText] = useState("");

  const incidentQuery = useIncident(id);
  const timelineQuery = useIncidentTimeline(id);
  const projectsQuery = useProjectsHealth();
  const ackMutation = useAcknowledgeIncident();
  const resolveMutation = useResolveIncident();
  const reopenMutation = useReopenIncident();
  const commentMutation = useCommentOnIncident();

  if (!id) {
    return (
      <PageContainer title="Incident">
        <ErrorState message="No incident id provided." />
      </PageContainer>
    );
  }

  if (incidentQuery.isLoading) {
    return (
      <PageContainer title="Incident">
        <LoadingState label="Loading incident..." minHeight={300} />
      </PageContainer>
    );
  }

  if (incidentQuery.isError || !incidentQuery.data) {
    return (
      <PageContainer title="Incident">
        <ErrorState message={getErrorMessage(incidentQuery.error)} onRetry={() => incidentQuery.refetch()} />
      </PageContainer>
    );
  }

  const incident = incidentQuery.data;
  const status = deriveIncidentStatus(incident);
  const projectName = (projectsQuery.data ?? []).find((p) => p.id === incident.projectId)?.name ?? incident.projectId;
  const durationMs = (incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : Date.now()) - new Date(incident.createdAt).getTime();

  return (
    <PageContainer title={`Incident #${incident.id}`}>
      <Stack sx={{ gap: 3 }}>
        {(incident.severity === "HIGH" || incident.severity === "CRITICAL") && status !== "RESOLVED" ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" variant="outlined" onClick={() => navigate(`/incident-command/${incident.id}`)}>
                Open Incident Command
              </Button>
            }
          >
            This is a {incident.severity} incident. Use Incident Command for a coordinated overview (roles, escalation, recovery, communications, checklist).
          </Alert>
        ) : null}
        <IncidentImpactBanner projectId={incident.projectId} />
        <RecentDeploymentBanner incidentId={incident.id} />
        <RecentChangesBanner incidentId={incident.id} />
        <ChangeContextBanner incidentId={incident.id} />

        <Card>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2 }}>
              <Stack sx={{ minWidth: 0 }}>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.5 }}>
                  <Typography variant="h3">{incident.title}</Typography>
                  <Chip
                    size="small"
                    label={severityLabels[incident.severity]}
                    sx={{ backgroundColor: `${severityColors[incident.severity]}1f`, color: severityColors[incident.severity] }}
                  />
                  <Chip size="small" label={status} sx={{ backgroundColor: `${STATUS_COLOR[status]}1f`, color: STATUS_COLOR[status] }} />
                </Stack>
                {incident.description ? (
                  <Typography variant="body2" color="text.secondary">
                    {incident.description}
                  </Typography>
                ) : null}
              </Stack>
              <Stack direction="row" sx={{ gap: 1 }}>
                {status === "OPEN" ? (
                  <Button variant="outlined" onClick={() => ackMutation.mutate(incident.id)} disabled={ackMutation.isPending}>
                    Acknowledge
                  </Button>
                ) : null}
                {status !== "RESOLVED" ? (
                  <Button variant="contained" color="success" onClick={() => setConfirmResolve(true)}>
                    Resolve
                  </Button>
                ) : (
                  <Button variant="outlined" color="warning" onClick={() => setConfirmReopen(true)}>
                    Reopen
                  </Button>
                )}
              </Stack>
            </Stack>

            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Project
                </Typography>
                <Typography variant="body2">{projectName}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Check
                </Typography>
                <Typography variant="body2">{incident.checkId}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Created
                </Typography>
                <Typography variant="body2">{formatDateTime(incident.createdAt)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Duration
                </Typography>
                <Typography variant="body2">{formatDuration(durationMs)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Acknowledged
                </Typography>
                <Typography variant="body2">{incident.acknowledgedAt ? formatDateTime(incident.acknowledgedAt) : "-"}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Resolved
                </Typography>
                <Typography variant="body2">{incident.resolvedAt ? formatDateTime(incident.resolvedAt) : "-"}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Assignee
                </Typography>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="body2">{incident.assigneeId ?? "Unassigned"}</Typography>
                  <AssignOnCallButton incidentId={incident.id} />
                </Stack>
              </Grid>
              {incident.resolutionReason ? (
                <Grid size={{ xs: 12 }}>
                  <Typography variant="overline" color="text.secondary">
                    Resolution
                  </Typography>
                  <Typography variant="body2">{incident.resolutionReason}</Typography>
                </Grid>
              ) : null}
            </Grid>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Timeline
            </Typography>
            {timelineQuery.isLoading ? (
              <LoadingState label="Loading timeline..." minHeight={120} />
            ) : timelineQuery.isError || !timelineQuery.data ? (
              <ErrorState message={getErrorMessage(timelineQuery.error)} onRetry={() => timelineQuery.refetch()} minHeight={120} />
            ) : timelineQuery.data.length === 0 ? (
              <EmptyState message="No timeline events yet." minHeight={120} />
            ) : (
              <Stack sx={{ gap: 1.5 }}>
                {timelineQuery.data.map((event) => (
                  <Stack key={event.id} direction="row" sx={{ gap: 1.5, alignItems: "flex-start" }}>
                    <Chip size="small" variant="outlined" label={TIMELINE_LABELS[event.eventType]} sx={{ flexShrink: 0 }} />
                    <Stack sx={{ minWidth: 0 }}>
                      <Typography variant="body2">{event.message}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(event.createdAt)}
                      </Typography>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}

            <Stack direction="row" sx={{ gap: 1, mt: 3 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Add a comment..."
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
              />
              <Button
                variant="outlined"
                disabled={!commentText.trim() || commentMutation.isPending}
                onClick={() => {
                  commentMutation.mutate({ id: incident.id, message: commentText.trim() }, { onSuccess: () => setCommentText("") });
                }}
              >
                Comment
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <CommunicationCard incident={incident} />
        <RecoveryActionsCard incidentId={incident.id} />
        <EscalationStatusCard incidentId={incident.id} />
        <PostmortemCard incidentId={incident.id} status={status} />
      </Stack>

      {/* Auftragspunkt 13 "Bestaetigungsdialoge fuer kritische Aktionen". */}
      <Dialog open={confirmResolve} onClose={() => setConfirmResolve(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Resolve incident #{incident.id}?</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            This marks the incident as resolved. It can be reopened later if the problem recurs.
          </Alert>
          <TextField
            label="Resolution reason (optional)"
            fullWidth
            multiline
            minRows={2}
            value={resolutionReason}
            onChange={(event) => setResolutionReason(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResolve(false)} disabled={resolveMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={resolveMutation.isPending}
            onClick={() =>
              resolveMutation.mutate(
                { id: incident.id, ...(resolutionReason.trim() ? { reason: resolutionReason.trim() } : {}) },
                { onSuccess: () => { setConfirmResolve(false); setResolutionReason(""); } },
              )
            }
          >
            Resolve
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmReopen} onClose={() => setConfirmReopen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reopen incident #{incident.id}?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">This marks the incident as open again and clears its acknowledgement.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReopen(false)} disabled={reopenMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={reopenMutation.isPending}
            onClick={() => reopenMutation.mutate(incident.id, { onSuccess: () => setConfirmReopen(false) })}
          >
            Reopen
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}

// Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis" -
// reine Frontend-Integration: Incidents fuehren keine eigene serviceId,
// aber `services.projectId` verlinkt einen Katalog-Service auf dasselbe
// Projekt (Phase 23) - ueber die bereits bestehende projectId-Filterung von
// useServices() (kein neuer Endpunkt) wird der zugehoerige Service
// gefunden, dessen Blast-Radius dann ueber den bereits bestehenden
// GET .../impact-Endpunkt (Phase 23/25) geladen wird. Zeigt sich selbst
// stumm (kein Platzhalter), wenn kein Katalog-Service verlinkt ist oder der
// Blast-Radius leer ist - kein Rauschen fuer den Regelfall.
function IncidentImpactBanner({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const servicesQuery = useServices({ projectId });
  const service = (servicesQuery.data ?? [])[0];
  const impactQuery = useServiceImpact(service ? String(service.id) : undefined);

  if (!service || !impactQuery.data || impactQuery.data.affectedServices.length === 0) return null;

  return (
    <Alert severity="warning" sx={{ cursor: "pointer" }} onClick={() => navigate(`/platform/services/${service.id}`)}>
      {impactQuery.data.summary.text} Click to view the full impact analysis for "{service.name}".
    </Alert>
  );
}

// Phase 27 "Enterprise Deployment Tracking & Change Correlation" - reine
// Frontend-Integration ueber den bereits bestehenden GET .../recent-
// deployments-Endpunkt (routes/incidents.routes.ts), zeigt sich stumm (kein
// Platzhalter), wenn im Korrelationsfenster kein Deployment fuer dieses
// Projekt erfasst wurde - kein Rauschen fuer den Regelfall, gleiches
// Prinzip wie IncidentImpactBanner oben.
function RecentDeploymentBanner({ incidentId }: { incidentId: string }) {
  const navigate = useNavigate();
  const query = useRecentDeploymentsForIncident(incidentId);
  const deployments = query.data?.deployments ?? [];

  if (deployments.length === 0) return null;
  const latest = deployments[0]!;

  return (
    <Alert severity="warning" sx={{ cursor: "pointer" }} onClick={() => navigate(`/projects/${latest.projectId}`)}>
      Deployment {latest.version} ({latest.environment}) was recorded {formatDateTime(latest.deployedAt)}, within{" "}
      {query.data?.windowMinutes} minutes before this incident{deployments.length > 1 ? ` (${deployments.length} total in window)` : ""}.
      Click to view the project's deployment history.
    </Alert>
  );
}

// Phase 28 (Fortsetzung) "Enterprise Change Management & Deployment
// Intelligence" Auftragspunkt 6 "Incident Correlation" - "Welche Changes
// fanden unmittelbar vor einem Incident statt?", exakt dasselbe Muster wie
// RecentDeploymentBanner direkt darueber (zeitfensterbasiert, kein
// unbeschraenktes "alle Changes fuer diesen Service" wie
// ChangeContextBanner unten - das beantwortet eine andere Frage, "gibt es
// UEBERHAUPT einen Change-Kontext").
function RecentChangesBanner({ incidentId }: { incidentId: string }) {
  const navigate = useNavigate();
  const query = useRecentChangesForIncident(incidentId);
  const changes = query.data?.changes ?? [];

  if (changes.length === 0) return null;
  const latest = changes[0]!;

  const reasonText = latest.correlationReason === "upstream-dependency" ? "on a service this incident's service depends on" : "on this incident's service";

  return (
    <Alert severity="warning" sx={{ cursor: "pointer" }} onClick={() => navigate(`/changes/${latest.id}`)}>
      Change "{latest.title}" ({latest.changeType}/{latest.category}) {reasonText} was active around {formatDateTime(latest.actualStartAt ?? latest.plannedStartAt ?? latest.createdAt)}, within{" "}
      {query.data?.windowMinutes} minutes before this incident{changes.length > 1 ? ` (${changes.length} total in window)` : ""}. Click to view the change.
    </Alert>
  );
}

// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk" Auftragspunkt 5 "Incident Integration" - reine Frontend-Integration
// ueber den bereits bestehenden GET .../change-context-Endpunkt
// (routes/incidents.routes.ts): zeigt, ob dieser Incident waehrend eines
// aktiven/geplanten Wartungsfensters oder Change fuer den betroffenen
// Service auftrat, plus verknuepfte Changes - hilft Operatoren einzuordnen,
// ob ein Vorfall eine tatsaechliche Stoerung oder eine geplante Auswirkung
// ist. Zeigt sich stumm, wenn kein Kontext gefunden wurde (gleiches Prinzip
// wie die Banner oben).
function ChangeContextBanner({ incidentId }: { incidentId: string }) {
  const navigate = useNavigate();
  const query = useIncidentChangeContext(incidentId);
  const context = query.data;
  if (!context || (!context.maintenanceWindow && context.relatedChanges.length === 0)) return null;

  return (
    <Alert severity="info">
      <Stack sx={{ gap: 0.5 }}>
        {context.maintenanceWindow ? (
          <Typography variant="body2">
            This incident occurred during a maintenance window ({formatDateTime(context.maintenanceWindow.startsAt)} -{" "}
            {formatDateTime(context.maintenanceWindow.endsAt)}): {context.maintenanceWindow.reason}
          </Typography>
        ) : null}
        {context.relatedChanges.length > 0 ? (
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <Typography variant="body2">Related changes on this service:</Typography>
            {context.relatedChanges.map((change) => (
              <Chip key={change.id} size="small" label={`${change.title} (${change.status})`} onClick={() => navigate(`/changes/${change.id}`)} clickable />
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Alert>
  );
}

// Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" - reine
// Frontend-Integration: reicht die ueber core/on-call.ts aufgeloeste
// aktuelle On-Call-Person als assigneeId an den BEREITS BESTEHENDEN
// POST /incidents/:id/assign-Endpunkt (Phase 21, useAssignIncident) weiter -
// kein neuer Backend-Endpunkt fuer "Incident zuweisen" noetig. Organisation/
// Team werden hier bewusst manuell ausgewaehlt statt automatisch aus dem
// Incident aufgeloest, da Incidents keine direkte organizationId fuehren
// (nur projectId) und eine serverseitige Projekt->Team-Rueckaufloesung
// (M:N ueber project_teams) fuer diesen einen Quick-Action-Knopf keinen
// zusaetzlichen Endpunkt rechtfertigt.
function AssignOnCallButton({ incidentId }: { incidentId: string }) {
  const [open, setOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [scheduleId, setScheduleId] = useState("");

  const organizationsQuery = useOrganizations();
  const teamsQuery = useTeams(organizationId || undefined);
  const schedulesQuery = useOnCallSchedules({ ...(organizationId ? { organizationId } : {}), ...(teamId ? { teamId } : {}) }, open);
  const currentQuery = useCurrentOnCall(scheduleId || undefined);
  const assignMutation = useAssignIncident();

  const current = currentQuery.data;

  return (
    <>
      <Button size="small" variant="outlined" onClick={() => setOpen(true)}>
        Assign on-call
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign to on-call</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2, mt: 1 }}>
            <TextField
              select
              label="Organization"
              size="small"
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value);
                setTeamId("");
                setScheduleId("");
              }}
            >
              {(organizationsQuery.data ?? []).map((org) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Team"
              size="small"
              value={teamId}
              disabled={!organizationId}
              onChange={(event) => {
                setTeamId(event.target.value);
                setScheduleId("");
              }}
            >
              {(teamsQuery.data ?? []).map((team) => (
                <MenuItem key={team.id} value={team.id}>
                  {team.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Schedule" size="small" value={scheduleId} disabled={!teamId} onChange={(event) => setScheduleId(event.target.value)}>
              {(schedulesQuery.data ?? []).map((schedule) => (
                <MenuItem key={schedule.id} value={schedule.id}>
                  {schedule.name}
                </MenuItem>
              ))}
            </TextField>
            {scheduleId ? (
              <Alert severity={current?.userId ? "info" : "warning"}>
                {current?.userId ? `Currently on call: ${current.userName}` : "Nobody is currently on call for this schedule."}
              </Alert>
            ) : null}
            {assignMutation.isError ? <Alert severity="error">{getErrorMessage(assignMutation.error)}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!current?.userId || assignMutation.isPending}
            onClick={() => {
              if (!current?.userId) return;
              assignMutation.mutate({ id: incidentId, assigneeId: current.userId }, { onSuccess: () => setOpen(false) });
            }}
          >
            Assign to {current?.userName ?? "on-call"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// Phase 27 "Enterprise On-Call & Escalation Management" Auftragspunkt 4
// "Incident Integration" - "aktueller On-Call-Responder sichtbar",
// "Eskalationsstatus sichtbar". Zeigt sich selbst stumm, wenn dieser
// Incident keiner Policy zugeordnet ist (der Regelfall fuer die meisten
// Projekte, kein Rauschen).
// Phase 30 "Enterprise Reliability, Automated Recovery & Operational
// Resilience" - zeigt die fuer dieses Incident-Projekt konfigurierten
// Recovery-Regeln (automation_rules mit trigger=INCIDENT_CREATED) samt
// ihrem AKTUELLEN Safety-Gate-Ergebnis (core/recovery-safety.ts). Bewusst
// KEINE rohe JSON-Anzeige - jeder Zustand (READY/BLOCKED/COOLDOWN/
// ALREADY_RUNNING/COMPLETED/FAILED) bekommt eine verstaendliche Farbe/Text,
// BLOCKED/COOLDOWN zeigen zusaetzlich den Grund.
const RECOVERY_VERDICT_COLOR: Record<string, "success" | "error" | "warning" | "info" | "default"> = {
  READY: "success",
  BLOCKED: "error",
  COOLDOWN: "warning",
  ALREADY_RUNNING: "info",
  COMPLETED: "success",
  FAILED: "error",
};

const RECOVERY_ACTION_LABELS: Record<string, string> = {
  RESTART_SERVICE: "Restart Service",
  CLEAR_CACHE: "Clear Cache",
  RUN_HEALTH_CHECK: "Run Health Check",
  CREATE_DIAGNOSTIC_SNAPSHOT: "Create Diagnostic Snapshot",
  COLLECT_LOGS: "Collect Logs",
  RESTART_CONTAINER: "Restart Container",
  RESTART_MONITOR: "Restart Monitor",
  RETRY_CHECK: "Retry Check",
  RELOAD_CONFIGURATION: "Reload Configuration",
  FLUSH_QUEUE: "Flush Queue",
  CREATE_BACKUP: "Create Backup",
  VERIFY_DEPENDENCIES: "Verify Dependencies",
};

const RECOVERY_MANAGE_ROLES = ["OWNER", "ADMIN"] as const;

// Phase 31 "Enterprise Change/Incident Communication & Stakeholder
// Notification Intelligence" - komponiert AUSSCHLIESSLICH bereits
// bestehende Hooks fuer den Summary-Kopf (Severity/Status vom Incident
// selbst, On-Call/Eskalation ueber useIncidentEscalationStatus, Blast
// Radius ueber useServices+useServiceImpact - identisch zu
// IncidentImpactBanner oben), kein neuer Backend-Endpunkt fuer diese
// Zusammenfassung. Recommendations/History kommen aus dem EINEN neuen
// GET .../communications-Aufruf.
const COMMUNICATION_SEVERITY_COLOR: Record<string, "info" | "warning" | "error"> = {
  INFO: "info",
  WARNING: "warning",
  HIGH: "warning",
  CRITICAL: "error",
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  INCIDENT_CREATED: "New incident",
  INCIDENT_ESCALATED: "Escalated",
  INCIDENT_ACKNOWLEDGED: "Acknowledged",
  INCIDENT_RESOLVED: "Resolved",
  LONG_RUNNING: "Long-running",
  CRITICAL_SERVICE: "Critical service",
  LARGE_BLAST_RADIUS: "Large blast radius",
  RECOVERY_SUCCEEDED: "Recovery succeeded",
  RECOVERY_FAILED: "Recovery failed",
  CHANGE_CORRELATION: "Change correlation",
  DEPLOYMENT_CORRELATION: "Deployment correlation",
};

function CommunicationCard({ incident }: { incident: Incident }) {
  const query = useIncidentCommunications(incident.id);
  const escalationQuery = useIncidentEscalationStatus(incident.id);
  const servicesQuery = useServices({ projectId: incident.projectId });
  const service = (servicesQuery.data ?? [])[0];
  const impactQuery = useServiceImpact(service ? String(service.id) : undefined);
  const createMutation = useCreateIncidentCommunication();
  const { hasProjectRole } = useAuth();

  const [sendOpen, setSendOpen] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState("");

  if (query.isLoading) {
    return (
      <Card>
        <CardContent>
          <LoadingState label="Loading communication..." minHeight={80} />
        </CardContent>
      </Card>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent>
          <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={80} />
        </CardContent>
      </Card>
    );
  }

  const { communications, recommendations } = query.data;
  const lastCommunication = communications[0];
  const canManage = hasProjectRole(incident.projectId, ["OWNER", "ADMIN", "DEVELOPER"]);

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5, flexWrap: "wrap", gap: 1 }}>
          <Typography variant="h4">Communication</Typography>
          {canManage ? (
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                setPrefillMessage("");
                setSendOpen(true);
              }}
            >
              Send communication
            </Button>
          ) : null}
        </Stack>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Severity
            </Typography>
            <Chip size="small" label={incident.severity} sx={{ backgroundColor: `${severityColors[incident.severity]}1f`, color: severityColors[incident.severity] }} />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Status
            </Typography>
            <Typography variant="body2">{deriveIncidentStatus(incident)}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              On-call responder
            </Typography>
            <Typography variant="body2">{escalationQuery.data?.currentTarget?.userName ?? "Unassigned"}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Escalation level
            </Typography>
            <Typography variant="body2">{escalationQuery.data?.currentStepOrder ?? 0}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Affected services
            </Typography>
            <Typography variant="body2">{service ? 1 + (impactQuery.data?.affectedServices.length ?? 0) : 0}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Blast radius
            </Typography>
            <Typography variant="body2">{impactQuery.data?.affectedServices.length ?? 0}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Last communication
            </Typography>
            <Typography variant="body2">{lastCommunication ? `${formatDateTime(lastCommunication.createdAt)} - ${lastCommunication.message}` : "None yet"}</Typography>
          </Grid>
        </Grid>

        {recommendations.length > 0 ? (
          <Stack sx={{ gap: 1, mb: 2 }}>
            <Typography variant="subtitle2">Recommendations</Typography>
            {recommendations.map((rec) => (
              <Alert
                key={rec.key}
                severity={COMMUNICATION_SEVERITY_COLOR[rec.severity] ?? "info"}
                action={
                  canManage ? (
                    <Button
                      size="small"
                      onClick={() => {
                        setPrefillMessage(rec.message);
                        setSendOpen(true);
                      }}
                    >
                      Use
                    </Button>
                  ) : undefined
                }
              >
                <strong>{RECOMMENDATION_LABELS[rec.key] ?? rec.key}:</strong> {rec.message}
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {rec.reason}
                </Typography>
              </Alert>
            ))}
          </Stack>
        ) : null}

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          History
        </Typography>
        {communications.length === 0 ? (
          <EmptyState message="No communications sent yet." minHeight={60} />
        ) : (
          <Stack sx={{ gap: 1 }}>
            {communications.map((comm) => (
              <Stack key={comm.id} direction="row" sx={{ gap: 1.5, alignItems: "flex-start", p: 1, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                <Chip size="small" label={comm.severity} color={COMMUNICATION_SEVERITY_COLOR[comm.severity] ?? "default"} />
                <Stack sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2">{comm.message}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDateTime(comm.createdAt)} - Target: {comm.targetType}
                    {comm.notificationChannelId ? ` via ${comm.notificationChannelId}` : ""}
                  </Typography>
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>

      <SendCommunicationDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        incident={incident}
        initialMessage={prefillMessage}
        mutation={createMutation}
      />
    </Card>
  );
}

interface SendCommunicationDialogProps {
  open: boolean;
  onClose: () => void;
  incident: Incident;
  initialMessage: string;
  mutation: ReturnType<typeof useCreateIncidentCommunication>;
}

// Zielauswahl mirrort exakt AssignOnCallButton oben (Organisation -> Team ->
// Schedule) fuer ON_CALL_SCHEDULE, ergaenzt um eine User-Auswahl ueber
// useOrganizationMembers() - dieselbe Herleitung "Incidents fuehren keine
// direkte organizationId" wie dort.
function SendCommunicationDialog({ open, onClose, incident, initialMessage, mutation }: SendCommunicationDialogProps) {
  const [message, setMessage] = useState(initialMessage);
  const [severity, setSeverity] = useState<CommunicationSeverity>("INFO");
  const [targetKind, setTargetKind] = useState<"GENERAL" | "USER" | "ON_CALL_SCHEDULE">("GENERAL");
  const [organizationId, setOrganizationId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [userId, setUserId] = useState("");
  const [channel, setChannel] = useState<NotificationChannelId | "">("");

  const organizationsQuery = useOrganizations();
  const teamsQuery = useTeams(organizationId || undefined);
  const schedulesQuery = useOnCallSchedules({ ...(organizationId ? { organizationId } : {}), ...(teamId ? { teamId } : {}) }, open && targetKind === "ON_CALL_SCHEDULE");
  const membersQuery = useOrganizationMembers(organizationId || undefined);

  useEffect(() => {
    if (open) setMessage(initialMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMessage]);

  const canSubmit =
    message.trim().length > 0 &&
    (targetKind === "GENERAL" || (targetKind === "USER" && userId.length > 0) || (targetKind === "ON_CALL_SCHEDULE" && scheduleId.length > 0));

  const handleSubmit = (): void => {
    mutation.mutate(
      {
        incidentId: incident.id,
        input: {
          message: message.trim(),
          severity,
          ...(targetKind === "USER" ? { targetUserId: userId } : {}),
          ...(targetKind === "ON_CALL_SCHEDULE" ? { targetScheduleId: Number(scheduleId) } : {}),
          ...(channel ? { notificationChannelId: channel } : {}),
        },
      },
      {
        onSuccess: () => {
          onClose();
          setMessage("");
          setTargetKind("GENERAL");
          setOrganizationId("");
          setTeamId("");
          setScheduleId("");
          setUserId("");
          setChannel("");
        },
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Send communication</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, pt: 1 }}>
          {mutation.isError ? <Alert severity="error">{getErrorMessage(mutation.error)}</Alert> : null}
          <TextField label="Message" value={message} onChange={(event) => setMessage(event.target.value)} multiline minRows={3} fullWidth autoFocus />
          <Stack direction="row" sx={{ gap: 2 }}>
            <TextField select label="Severity" size="small" value={severity} onChange={(event) => setSeverity(event.target.value as CommunicationSeverity)} sx={{ minWidth: 140 }}>
              {COMMUNICATION_SEVERITIES.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Channel (optional)" size="small" value={channel} onChange={(event) => setChannel(event.target.value as NotificationChannelId | "")} sx={{ minWidth: 160 }}>
              <MenuItem value="">None</MenuItem>
              <MenuItem value="EMAIL">EMAIL</MenuItem>
              <MenuItem value="PUSH">PUSH</MenuItem>
              <MenuItem value="IN_APP">IN_APP</MenuItem>
              <MenuItem value="WEBSOCKET">WEBSOCKET</MenuItem>
            </TextField>
          </Stack>
          <TextField
            select
            label="Target"
            size="small"
            value={targetKind}
            onChange={(event) => {
              setTargetKind(event.target.value as typeof targetKind);
              setUserId("");
              setScheduleId("");
            }}
          >
            <MenuItem value="GENERAL">General (no specific recipient)</MenuItem>
            <MenuItem value="USER">Specific user</MenuItem>
            <MenuItem value="ON_CALL_SCHEDULE">On-call schedule</MenuItem>
          </TextField>
          {targetKind !== "GENERAL" ? (
            <TextField
              select
              label="Organization"
              size="small"
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value);
                setTeamId("");
                setScheduleId("");
                setUserId("");
              }}
            >
              {(organizationsQuery.data ?? []).map((org) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          {targetKind === "USER" ? (
            <TextField select label="User" size="small" value={userId} disabled={!organizationId} onChange={(event) => setUserId(event.target.value)}>
              {(membersQuery.data ?? []).map((member) => (
                <MenuItem key={member.userId} value={member.userId}>
                  {member.userName} ({member.userEmail})
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          {targetKind === "ON_CALL_SCHEDULE" ? (
            <>
              <TextField select label="Team" size="small" value={teamId} disabled={!organizationId} onChange={(event) => { setTeamId(event.target.value); setScheduleId(""); }}>
                {(teamsQuery.data ?? []).map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label="Schedule" size="small" value={scheduleId} disabled={!teamId} onChange={(event) => setScheduleId(event.target.value)}>
                {(schedulesQuery.data ?? []).map((schedule) => (
                  <MenuItem key={schedule.id} value={schedule.id}>
                    {schedule.name}
                  </MenuItem>
                ))}
              </TextField>
            </>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSubmit || mutation.isPending} onClick={handleSubmit}>
          Send
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RecoveryActionsCard({ incidentId }: { incidentId: string }) {
  const query = useIncidentRecoveryActions(incidentId);
  const executeMutation = useExecuteRecoveryAction();
  const { hasProjectRole } = useAuth();

  if (query.isLoading) {
    return (
      <Card>
        <CardContent>
          <LoadingState label="Loading recovery actions..." minHeight={80} />
        </CardContent>
      </Card>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent>
          <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={80} />
        </CardContent>
      </Card>
    );
  }
  const { recoveryActions, service } = query.data;
  if (recoveryActions.length === 0) {
    return null;
  }

  const canManage = hasProjectRole(recoveryActions[0]?.rule.projectId ?? "", [...RECOVERY_MANAGE_ROLES]);

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
          <Typography variant="h4">Recovery Actions</Typography>
          {service ? <Chip size="small" variant="outlined" label={`Service: ${service.name}`} /> : null}
        </Stack>
        {executeMutation.isError ? (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {getErrorMessage(executeMutation.error)}
          </Alert>
        ) : null}
        <Stack sx={{ gap: 1.5 }}>
          {recoveryActions.map(({ rule, safety, hasExecutor }) => (
            <Stack
              key={rule.id}
              direction="row"
              sx={{ justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap", p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}
            >
              <Stack sx={{ minWidth: 0 }}>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {rule.name}
                  </Typography>
                  <Chip size="small" label={RECOVERY_ACTION_LABELS[rule.action] ?? rule.action} variant="outlined" />
                  <Chip size="small" label={safety.verdict} color={RECOVERY_VERDICT_COLOR[safety.verdict] ?? "default"} />
                  <Chip size="small" label={`Risk: ${rule.riskLevel}`} variant="outlined" />
                </Stack>
                {safety.reason ? (
                  <Typography variant="caption" color="text.secondary">
                    {safety.reason}
                  </Typography>
                ) : null}
                <Typography variant="caption" color="text.secondary">
                  Attempts: {safety.attempts}/{safety.maxAttempts} · Cooldown: {rule.cooldownMinutes}m · Timeout: {rule.timeoutSeconds}s
                </Typography>
              </Stack>
              {canManage && hasExecutor ? (
                <Button
                  size="small"
                  variant="contained"
                  disabled={safety.verdict !== "READY" || executeMutation.isPending}
                  onClick={() => executeMutation.mutate({ incidentId, ruleId: rule.id })}
                >
                  Execute
                </Button>
              ) : null}
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function EscalationStatusCard({ incidentId }: { incidentId: string }) {
  const query = useIncidentEscalationStatus(incidentId);
  const status = query.data;

  if (!status || !status.policy) return null;

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="h4">Escalation</Typography>
          <Chip size="small" label={status.policy.name} variant="outlined" />
        </Stack>
        {status.currentTarget ? (
          <Alert severity="warning" sx={{ mb: status.nextStep ? 1 : 0 }}>
            Currently at step {status.currentTarget.stepOrder}
            {status.currentTarget.userName ? ` - paging ${status.currentTarget.userName}` : " - no responder could be resolved"}.
          </Alert>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No escalation step has fired yet.
          </Typography>
        )}
        {status.nextStep ? (
          <Typography variant="caption" color="text.secondary">
            Next step ({status.nextStep.stepOrder}) due {formatDateTime(status.nextStep.dueAt)} unless acknowledged first.
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

// Phase 26 "Enterprise Incident Postmortems & Retrospectives" - eigene Card
// statt eigener Unterseite, da ein Postmortem inhaltlich zum Incident
// gehoert (1:1-Beziehung, siehe Backend-Migration 0047) und die
// Incident-Detailseite ohnehin bereits der zentrale Ort fuer den gesamten
// Lifecycle ist (Timeline, Acknowledge/Resolve/Reopen).
function PostmortemCard({ incidentId, status }: { incidentId: string; status: IncidentStatus }) {
  const postmortemQuery = useIncidentPostmortem(incidentId);
  const createMutation = useCreatePostmortem();
  const updateMutation = useUpdatePostmortem();
  const publishMutation = usePublishPostmortem();

  const [useTimeline, setUseTimeline] = useState(true);
  const notFound = axios.isAxiosError(postmortemQuery.error) && postmortemQuery.error.response?.status === 404;

  if (postmortemQuery.isLoading) {
    return (
      <Card>
        <CardContent>
          <LoadingState label="Loading postmortem..." minHeight={80} />
        </CardContent>
      </Card>
    );
  }

  if (postmortemQuery.isError && !notFound) {
    return (
      <Card>
        <CardContent>
          <ErrorState message={getErrorMessage(postmortemQuery.error)} onRetry={() => postmortemQuery.refetch()} minHeight={80} />
        </CardContent>
      </Card>
    );
  }

  if (!postmortemQuery.data) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Postmortem
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No postmortem has been written for this incident yet.
          </Typography>
          <Stack direction="row" sx={{ gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              variant="contained"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate({ incidentId, input: { useTimeline } })}
            >
              Create postmortem
            </Button>
            <Button size="small" onClick={() => setUseTimeline((v) => !v)} sx={{ textTransform: "none" }}>
              {useTimeline ? "☑" : "☐"} Prefill notes from timeline
            </Button>
          </Stack>
          {createMutation.isError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {getErrorMessage(createMutation.error)}
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const postmortem = postmortemQuery.data;
  const readOnly = postmortem.status === "PUBLISHED";

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
            <Typography variant="h4">Postmortem</Typography>
            <Chip size="small" label={postmortem.status} variant="outlined" />
          </Stack>
          {!readOnly ? (
            <Button
              variant="contained"
              color="success"
              size="small"
              disabled={publishMutation.isPending || !postmortem.summary?.trim() || !postmortem.rootCause?.trim()}
              onClick={() => publishMutation.mutate(incidentId)}
            >
              Publish
            </Button>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Published {postmortem.publishedAt ? formatDateTime(postmortem.publishedAt) : ""}
            </Typography>
          )}
        </Stack>

        {!readOnly && (!postmortem.summary?.trim() || !postmortem.rootCause?.trim()) ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            Summary and root cause are required before this postmortem can be published.
          </Alert>
        ) : null}

        <PostmortemFields
          key={postmortem.id}
          postmortem={postmortem}
          readOnly={readOnly}
          saving={updateMutation.isPending}
          onSave={(input) => updateMutation.mutate({ incidentId, input })}
        />

        {updateMutation.isError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {getErrorMessage(updateMutation.error)}
          </Alert>
        ) : null}
        {publishMutation.isError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {getErrorMessage(publishMutation.error)}
          </Alert>
        ) : null}

        <ActionItemsSection incidentId={incidentId} postmortem={postmortem} readOnly={readOnly} />

        {status !== "RESOLVED" ? (
          <Alert severity="info" sx={{ mt: 3 }}>
            This incident is not resolved yet - the postmortem can still be edited freely.
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

type PostmortemFieldsInput = {
  summary: string;
  impact: string;
  rootCause: string;
  resolution: string;
  timelineNotes: string;
};

function PostmortemFields({
  postmortem,
  readOnly,
  saving,
  onSave,
}: {
  postmortem: PostmortemWithActionItems;
  readOnly: boolean;
  saving: boolean;
  onSave: (input: PostmortemFieldsInput) => void;
}) {
  const [fields, setFields] = useState<PostmortemFieldsInput>({
    summary: postmortem.summary ?? "",
    impact: postmortem.impact ?? "",
    rootCause: postmortem.rootCause ?? "",
    resolution: postmortem.resolution ?? "",
    timelineNotes: postmortem.timelineNotes ?? "",
  });
  const dirty =
    fields.summary !== (postmortem.summary ?? "") ||
    fields.impact !== (postmortem.impact ?? "") ||
    fields.rootCause !== (postmortem.rootCause ?? "") ||
    fields.resolution !== (postmortem.resolution ?? "") ||
    fields.timelineNotes !== (postmortem.timelineNotes ?? "");

  return (
    <Stack sx={{ gap: 2 }}>
      <TextField
        label="Summary"
        multiline
        minRows={2}
        fullWidth
        disabled={readOnly}
        value={fields.summary}
        onChange={(e) => setFields((f) => ({ ...f, summary: e.target.value }))}
      />
      <TextField
        label="Impact"
        multiline
        minRows={2}
        fullWidth
        disabled={readOnly}
        value={fields.impact}
        onChange={(e) => setFields((f) => ({ ...f, impact: e.target.value }))}
      />
      <TextField
        label="Root cause"
        multiline
        minRows={2}
        fullWidth
        disabled={readOnly}
        value={fields.rootCause}
        onChange={(e) => setFields((f) => ({ ...f, rootCause: e.target.value }))}
      />
      <TextField
        label="Resolution"
        multiline
        minRows={2}
        fullWidth
        disabled={readOnly}
        value={fields.resolution}
        onChange={(e) => setFields((f) => ({ ...f, resolution: e.target.value }))}
      />
      <TextField
        label="Timeline notes"
        multiline
        minRows={3}
        fullWidth
        disabled={readOnly}
        value={fields.timelineNotes}
        onChange={(e) => setFields((f) => ({ ...f, timelineNotes: e.target.value }))}
      />
      {!readOnly ? (
        <Stack direction="row">
          <Button variant="outlined" disabled={!dirty || saving} onClick={() => onSave(fields)}>
            Save
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}

const ACTION_ITEM_STATUS_LABELS: Record<ActionItemStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

function ActionItemsSection({
  incidentId,
  postmortem,
  readOnly,
}: {
  incidentId: string;
  postmortem: PostmortemWithActionItems;
  readOnly: boolean;
}) {
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const createMutation = useCreateActionItem();
  const updateMutation = useUpdateActionItem();
  const deleteMutation = useDeleteActionItem();

  return (
    <Stack sx={{ mt: 3, gap: 1.5 }}>
      <Typography variant="h5">Action items</Typography>
      {postmortem.actionItems.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No action items yet.
        </Typography>
      ) : (
        postmortem.actionItems.map((item) => (
          <Stack key={item.id} direction="row" sx={{ alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 200 }}>
              {item.description}
            </Typography>
            {item.dueDate ? (
              <Typography variant="caption" color="text.secondary">
                Due {item.dueDate}
              </Typography>
            ) : null}
            <TextField
              select
              size="small"
              value={item.status}
              disabled={readOnly || updateMutation.isPending}
              onChange={(e) =>
                updateMutation.mutate({
                  incidentId,
                  itemId: item.id,
                  input: { status: e.target.value as ActionItemStatus },
                })
              }
              sx={{ minWidth: 140 }}
            >
              {ACTION_ITEM_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {ACTION_ITEM_STATUS_LABELS[s]}
                </MenuItem>
              ))}
            </TextField>
            {!readOnly ? (
              <IconButton
                size="small"
                aria-label="Delete action item"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ incidentId, itemId: item.id })}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            ) : null}
          </Stack>
        ))
      )}

      {!readOnly ? (
        <Stack direction="row" sx={{ gap: 1, mt: 1, flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder="New action item..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{ flexGrow: 1, minWidth: 200 }}
          />
          <TextField
            size="small"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            sx={{ width: 160 }}
          />
          <Button
            variant="outlined"
            disabled={!description.trim() || createMutation.isPending}
            onClick={() =>
              createMutation.mutate(
                { incidentId, input: { description: description.trim(), ...(dueDate ? { dueDate } : {}) } },
                { onSuccess: () => { setDescription(""); setDueDate(""); } },
              )
            }
          >
            Add
          </Button>
        </Stack>
      ) : null}
      {createMutation.isError ? <Alert severity="error">{getErrorMessage(createMutation.error)}</Alert> : null}
    </Stack>
  );
}
