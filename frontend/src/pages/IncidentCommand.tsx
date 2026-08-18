import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import Grid from "@mui/material/Grid";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import CloseIcon from "@mui/icons-material/Close";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useIncident } from "../hooks/useIncidents";
import { useIncidentCommandOverview, useAssignCommandRole, useUnassignCommandRole, useUpdateChecklistItem } from "../hooks/useIncidentCommand";
import { useCreateIncidentCommunication } from "../hooks/useIncidentCommunications";
import { useOrganizations, useOrganizationMembers } from "../hooks/useOrganizations";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime } from "../utils/formatters";
import { severityColors } from "../theme/statusColors";
import { deriveIncidentStatus } from "../types/incident.types";
import { INCIDENT_COMMAND_ROLE_TYPES, CHECKLIST_ITEM_KEYS } from "../types/incident-command.types";
import type { IncidentCommandRoleType, ChecklistItemKey, ChecklistItemStatus } from "../types/incident-command.types";

const ROLE_LABELS: Record<IncidentCommandRoleType, string> = {
  INCIDENT_COMMANDER: "Incident Commander",
  TECHNICAL_LEAD: "Technical Lead",
  COMMUNICATIONS_LEAD: "Communications Lead",
};

const CHECKLIST_LABELS: Record<ChecklistItemKey, string> = {
  COMMANDER_ASSIGNED: "Commander assigned",
  TECHNICAL_LEAD_ASSIGNED: "Technical Lead assigned",
  COMMUNICATION_ASSESSED: "Communication assessed",
  STAKEHOLDERS_NOTIFIED: "Stakeholders notified",
  BLAST_RADIUS_REVIEWED: "Blast Radius reviewed",
  RECENT_CHANGES_REVIEWED: "Recent Changes reviewed",
  RECOVERY_ACTIONS_REVIEWED: "Recovery Actions reviewed",
  ESCALATION_REVIEWED: "Escalation reviewed",
  POSTMORTEM_REQUIRED: "Postmortem required",
};

const VERDICT_COLOR: Record<string, "success" | "error" | "warning" | "info" | "default"> = {
  READY: "success",
  BLOCKED: "error",
  COOLDOWN: "warning",
  ALREADY_RUNNING: "info",
  COMPLETED: "success",
  FAILED: "error",
};

export function IncidentCommand() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const incidentQuery = useIncident(id);
  const overviewQuery = useIncidentCommandOverview(id);
  const assignRoleMutation = useAssignCommandRole();
  const unassignRoleMutation = useUnassignCommandRole();
  const checklistMutation = useUpdateChecklistItem();
  const communicationMutation = useCreateIncidentCommunication();

  const [roleDialogOpen, setRoleDialogOpen] = useState<IncidentCommandRoleType | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendMessage, setSendMessage] = useState("");

  if (incidentQuery.isLoading || overviewQuery.isLoading) {
    return (
      <PageContainer title="Incident Command">
        <LoadingState label="Loading command center..." minHeight={200} />
      </PageContainer>
    );
  }
  if (incidentQuery.isError || !incidentQuery.data) {
    return (
      <PageContainer title="Incident Command">
        <ErrorState message={getErrorMessage(incidentQuery.error)} onRetry={() => incidentQuery.refetch()} minHeight={200} />
      </PageContainer>
    );
  }
  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <PageContainer title="Incident Command">
        <ErrorState message={getErrorMessage(overviewQuery.error)} onRetry={() => overviewQuery.refetch()} minHeight={200} />
      </PageContainer>
    );
  }

  const incident = incidentQuery.data;
  const overview = overviewQuery.data;
  const status = deriveIncidentStatus(incident);
  const rolesByType = new Map(overview.command.roles.map((r) => [r.role, r]));
  const checklistByKey = new Map(overview.command.checklist.map((c) => [c.key, c]));

  const cycleStatus = (current: ChecklistItemStatus): ChecklistItemStatus => (current === "OPEN" ? "DONE" : current === "DONE" ? "SKIPPED" : "OPEN");

  return (
    <PageContainer title={`Incident Command - #${incident.id}`}>
      <Stack sx={{ gap: 3, pb: 4 }}>
        {/* Incident Status */}
        <Card>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
              <Stack>
                <Typography variant="h3">{incident.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Project: {incident.projectId} - Created {formatDateTime(incident.createdAt)}
                </Typography>
              </Stack>
              <Stack direction="row" sx={{ gap: 1 }}>
                <Chip label={incident.severity} sx={{ backgroundColor: `${severityColors[incident.severity]}1f`, color: severityColors[incident.severity] }} />
                <Chip label={status} variant="outlined" />
                <Button size="small" variant="outlined" onClick={() => navigate(`/incidents/${incident.id}`)}>
                  Open Incident Detail
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Grid container spacing={3}>
          {/* Command Team */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1.5 }}>
                  Command Team
                </Typography>
                <Stack sx={{ gap: 1 }}>
                  {INCIDENT_COMMAND_ROLE_TYPES.map((role) => {
                    const holder = rolesByType.get(role);
                    return (
                      <Stack key={role} direction="row" sx={{ justifyContent: "space-between", alignItems: "center", p: 1, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                        <Stack>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {ROLE_LABELS[role]}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {holder ? holder.userName : "Unassigned"}
                          </Typography>
                        </Stack>
                        <Stack direction="row" sx={{ gap: 0.5 }}>
                          <Button size="small" onClick={() => setRoleDialogOpen(role)}>
                            {holder ? "Reassign" : "Assign"}
                          </Button>
                          {holder ? (
                            <IconButton size="small" onClick={() => unassignRoleMutation.mutate({ incidentId: incident.id, role })}>
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          ) : null}
                        </Stack>
                      </Stack>
                    );
                  })}
                </Stack>
                {overview.command.lastUpdatedAt ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                    Last command update: {formatDateTime(overview.command.lastUpdatedAt)}
                  </Typography>
                ) : null}
              </CardContent>
            </Card>
          </Grid>

          {/* Escalation */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1.5 }}>
                  Escalation
                </Typography>
                {overview.escalation.policy === null ? (
                  <Alert severity="info">No escalation policy configured</Alert>
                ) : (
                  <Stack sx={{ gap: 0.5 }}>
                    <Typography variant="body2">Policy: {overview.escalation.policy.name}</Typography>
                    <Typography variant="body2">Current step: {overview.escalation.currentStepOrder}</Typography>
                    <Typography variant="body2">
                      {overview.escalation.currentTarget?.userName ? `Paging: ${overview.escalation.currentTarget.userName}` : "No responder resolved yet"}
                    </Typography>
                    {overview.escalation.nextStep ? (
                      <Typography variant="caption" color="text.secondary">
                        Next step {overview.escalation.nextStep.stepOrder} due {formatDateTime(overview.escalation.nextStep.dueAt)}
                      </Typography>
                    ) : null}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Impact / Blast Radius */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1.5 }}>
                  Impact / Blast Radius
                </Typography>
                {overview.impact === null ? (
                  <Typography variant="body2" color="text.secondary">
                    No catalog service linked to this project.
                  </Typography>
                ) : (
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Affected services
                      </Typography>
                      <Typography variant="h5">{overview.impact.affectedServiceCount}</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        SPOF candidates
                      </Typography>
                      <Typography variant="h5">{overview.impact.spofCount}</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Max depth
                      </Typography>
                      <Typography variant="h5">{overview.impact.maxDepthReached}</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Critical path
                      </Typography>
                      <Typography variant="h5">{overview.impact.hasCriticalPath ? "Yes" : "No"}</Typography>
                    </Grid>
                  </Grid>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Recovery */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1.5 }}>
                  Recovery
                </Typography>
                {overview.recovery.recoveryActions.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No recovery actions configured for this project.
                  </Typography>
                ) : (
                  <Stack sx={{ gap: 1 }}>
                    {overview.recovery.recoveryActions.map((entry) => (
                      <Stack key={entry.rule.id} direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                        <Typography variant="body2">{entry.rule.name}</Typography>
                        <Chip size="small" label={entry.safety.verdict} color={VERDICT_COLOR[entry.safety.verdict] ?? "default"} />
                      </Stack>
                    ))}
                    <Button size="small" onClick={() => navigate(`/incidents/${incident.id}`)}>
                      Manage in Incident Detail
                    </Button>
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Communications */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Typography variant="h4">Communications</Typography>
                  <Button size="small" variant="contained" onClick={() => setSendOpen(true)}>
                    Send
                  </Button>
                </Stack>
                {overview.communications.recommendations.length > 0 ? (
                  <Alert severity="warning" sx={{ mb: 1 }}>
                    {overview.communications.recommendations[0]?.message}
                  </Alert>
                ) : null}
                {overview.communications.recent.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No communications sent yet.
                  </Typography>
                ) : (
                  <Stack sx={{ gap: 0.5 }}>
                    {overview.communications.recent.map((c) => (
                      <Typography key={c.id} variant="body2">
                        {formatDateTime(c.createdAt)} - {c.message}
                      </Typography>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Recent Changes */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1.5 }}>
                  Recent Changes
                </Typography>
                {overview.changeIntelligence.risk ? (
                  <Alert severity={overview.changeIntelligence.risk.verdict === "BLOCKED" ? "error" : overview.changeIntelligence.risk.verdict === "WARNING" ? "warning" : "success"} sx={{ mb: 1 }}>
                    Top correlated change risk: {overview.changeIntelligence.risk.verdict} (score {overview.changeIntelligence.risk.score})
                    {overview.changeIntelligence.risk.blockers.length > 0 ? ` - ${overview.changeIntelligence.risk.blockers.map((b) => b.label).join("; ")}` : ""}
                  </Alert>
                ) : null}
                {overview.changeIntelligence.relevantChanges.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No correlated changes in the recent window.
                  </Typography>
                ) : (
                  <Stack sx={{ gap: 0.5 }}>
                    {overview.changeIntelligence.relevantChanges.map((c) => (
                      <Typography key={c.id} variant="body2">
                        #{c.id} {c.title} ({c.status}) - {c.minutesBeforeIncident}min before
                      </Typography>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Checklist */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1.5 }}>
                  Checklist
                </Typography>
                <Stack sx={{ gap: 0.5 }}>
                  {CHECKLIST_ITEM_KEYS.map((key) => {
                    const item = checklistByKey.get(key);
                    const itemStatus = item?.status ?? "OPEN";
                    return (
                      <Stack key={key} direction="row" sx={{ alignItems: "center", gap: 1 }}>
                        <Checkbox
                          size="small"
                          checked={itemStatus === "DONE"}
                          indeterminate={itemStatus === "SKIPPED"}
                          onClick={() => checklistMutation.mutate({ incidentId: incident.id, itemKey: key, status: cycleStatus(itemStatus) })}
                        />
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          {CHECKLIST_LABELS[key]}
                        </Typography>
                        <Chip size="small" variant="outlined" label={itemStatus} />
                      </Stack>
                    );
                  })}
                </Stack>
                {overview.postmortem.exists ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                    Postmortem: {overview.postmortem.status} ({overview.postmortem.openActionItemCount}/{overview.postmortem.actionItemCount} action items open)
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                    Postmortem recommended - none created yet.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Phase 35 "Enterprise Problem Management & Root-Cause Intelligence"
              Auftragspunkt 15 "Command Center Integration" - reine Anzeige/
              Verknuepfung, keine eigene Problem-Logik hier. */}
          {overview.relatedProblems.length > 0 ? (
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: "100%" }}>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 1.5 }}>
                    Related Problems
                  </Typography>
                  <Stack sx={{ gap: 1 }}>
                    {overview.relatedProblems.map((problem) => (
                      <Stack
                        key={problem.id}
                        direction="row"
                        sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, cursor: "pointer" }}
                        onClick={() => navigate(`/problems/${problem.id}`)}
                      >
                        <Typography variant="body2">{problem.title}</Typography>
                        <Stack direction="row" sx={{ gap: 0.5 }}>
                          <Chip size="small" variant="outlined" label={problem.priority} />
                          <Chip size="small" variant="outlined" label={problem.status} />
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ) : null}

          {/* Timeline */}
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1.5 }}>
                  Timeline ({overview.timeline.totalEvents} events)
                </Typography>
                <Stack sx={{ gap: 1 }}>
                  {overview.timeline.recent.map((event) => (
                    <Stack key={event.id} direction="row" sx={{ gap: 1.5 }}>
                      <Chip size="small" variant="outlined" label={event.eventType} sx={{ flexShrink: 0 }} />
                      <Typography variant="body2">{event.message}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(event.createdAt)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Stack>

      {roleDialogOpen ? (
        <AssignRoleDialog
          role={roleDialogOpen}
          incidentId={incident.id}
          onClose={() => setRoleDialogOpen(null)}
          mutation={assignRoleMutation}
        />
      ) : null}

      <Dialog open={sendOpen} onClose={() => setSendOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Send communication</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2, pt: 1 }}>
            {communicationMutation.isError ? <Alert severity="error">{getErrorMessage(communicationMutation.error)}</Alert> : null}
            <TextField label="Message" value={sendMessage} onChange={(event) => setSendMessage(event.target.value)} multiline minRows={3} fullWidth autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!sendMessage.trim() || communicationMutation.isPending}
            onClick={() => {
              communicationMutation.mutate(
                { incidentId: incident.id, input: { message: sendMessage.trim(), severity: "INFO" } },
                { onSuccess: () => { setSendOpen(false); setSendMessage(""); } },
              );
            }}
          >
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}

function AssignRoleDialog({
  role,
  incidentId,
  onClose,
  mutation,
}: {
  role: IncidentCommandRoleType;
  incidentId: string;
  onClose: () => void;
  mutation: ReturnType<typeof useAssignCommandRole>;
}) {
  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");
  const organizationsQuery = useOrganizations();
  const membersQuery = useOrganizationMembers(organizationId || undefined);

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Assign {ROLE_LABELS[role]}</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, pt: 1 }}>
          {mutation.isError ? <Alert severity="error">{getErrorMessage(mutation.error)}</Alert> : null}
          <TextField
            select
            label="Organization"
            size="small"
            value={organizationId}
            onChange={(event) => {
              setOrganizationId(event.target.value);
              setUserId("");
            }}
          >
            {(organizationsQuery.data ?? []).map((org) => (
              <MenuItem key={org.id} value={org.id}>
                {org.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="User" size="small" value={userId} disabled={!organizationId} onChange={(event) => setUserId(event.target.value)}>
            {(membersQuery.data ?? []).map((member) => (
              <MenuItem key={member.userId} value={member.userId}>
                {member.userName} ({member.userEmail})
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!userId || mutation.isPending}
          onClick={() => mutation.mutate({ incidentId, role, userId }, { onSuccess: onClose })}
        >
          Assign
        </Button>
      </DialogActions>
    </Dialog>
  );
}
