import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import {
  useDeleteProblem,
  useLinkChange,
  useLinkIncident,
  useProblem,
  useUnlinkChange,
  useUnlinkIncident,
  useUpdateProblem,
} from "../hooks/useProblems";
import { useOrganizationMembers } from "../hooks/useOrganizations";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime, formatDuration } from "../utils/formatters";
import { healthStatusColors, severityColors } from "../theme/statusColors";
import { PROBLEM_PRIORITIES, PROBLEM_STATUSES } from "../types/problem.types";
import type { ProblemPriority, ProblemStatus } from "../types/problem.types";
import { RemediationEffectiveness } from "../components/problems/RemediationEffectiveness";

const PROBLEM_STATUS_COLORS: Record<ProblemStatus, string> = {
  OPEN: healthStatusColors.critical,
  INVESTIGATING: healthStatusColors.warning,
  KNOWN_ERROR: healthStatusColors.warning,
  MITIGATED: healthStatusColors.warning,
  RESOLVED: healthStatusColors.healthy,
  CLOSED: healthStatusColors.healthy,
};

const PROBLEM_PRIORITY_COLORS: Record<ProblemPriority, string> = {
  LOW: healthStatusColors.healthy,
  MEDIUM: healthStatusColors.warning,
  HIGH: healthStatusColors.warning,
  CRITICAL: healthStatusColors.critical,
};

// Phase 35 "Enterprise Problem Management & Root-Cause Intelligence"
// Auftragspunkt 24 "Problem Detail".
export function ProblemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [linkIncidentOpen, setLinkIncidentOpen] = useState(false);
  const [linkChangeOpen, setLinkChangeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const problemQuery = useProblem(id);
  const deleteMutation = useDeleteProblem();
  const unlinkIncidentMutation = useUnlinkIncident();
  const unlinkChangeMutation = useUnlinkChange();
  // Vor den fruehen Returns unten aufgerufen (Rules of Hooks) - organizationId
  // ist erst nach dem Laden von problemQuery bekannt, useOrganizationMembers()
  // handhabt ein undefined organizationId bereits ueber sein eigenes
  // `enabled`-Flag (siehe hooks/useOrganizations.ts).
  const membersQueryForOwnerName = useOrganizationMembers(problemQuery.data?.organizationId);

  if (!id) {
    return (
      <PageContainer title="Problem">
        <ErrorState message="No problem id provided." />
      </PageContainer>
    );
  }

  if (problemQuery.isLoading) {
    return (
      <PageContainer title="Problem">
        <LoadingState label="Loading problem..." minHeight={300} />
      </PageContainer>
    );
  }

  if (problemQuery.isError || !problemQuery.data) {
    return (
      <PageContainer title="Problem">
        <ErrorState message={getErrorMessage(problemQuery.error)} onRetry={() => problemQuery.refetch()} />
      </PageContainer>
    );
  }

  const problem = problemQuery.data;
  const ownerName = problem.ownerUserId
    ? (membersQueryForOwnerName.data ?? []).find((member) => member.userId === problem.ownerUserId)?.userName ?? problem.ownerUserId
    : "Unassigned";

  return (
    <PageContainer title={problem.title}>
      <Stack sx={{ gap: 3 }}>
        <Card>
          <CardContent>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 1 }}>
              <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Typography variant="h3">{problem.title}</Typography>
                <Chip size="small" label={problem.priority} sx={{ backgroundColor: `${PROBLEM_PRIORITY_COLORS[problem.priority]}1f`, color: PROBLEM_PRIORITY_COLORS[problem.priority] }} />
                <Chip size="small" label={problem.status} sx={{ backgroundColor: `${PROBLEM_STATUS_COLORS[problem.status]}1f`, color: PROBLEM_STATUS_COLORS[problem.status] }} />
              </Stack>
              <Stack direction="row" sx={{ gap: 1 }}>
                <Button size="small" startIcon={<EditOutlinedIcon fontSize="small" />} onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
                <Button size="small" color="error" startIcon={<DeleteOutlineIcon fontSize="small" />} onClick={() => setDeleteOpen(true)}>
                  Delete
                </Button>
              </Stack>
            </Stack>
            {problem.description ? (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {problem.description}
              </Typography>
            ) : null}
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Owner
                </Typography>
                <Typography variant="body2">{ownerName}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Created
                </Typography>
                <Typography variant="body2">{formatDateTime(problem.createdAt)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Updated
                </Typography>
                <Typography variant="body2">{formatDateTime(problem.updatedAt)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Resolved
                </Typography>
                <Typography variant="body2">{problem.resolvedAt ? formatDateTime(problem.resolvedAt) : "-"}</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: "100%" }}>
              <CardHeader title="Root Cause" slotProps={{ title: { variant: "h6" } }} />
              <CardContent sx={{ pt: 0 }}>
                <Typography variant="body2">{problem.rootCause ?? "Not documented yet."}</Typography>
                {problem.rootCauseHints.length > 0 ? (
                  <Stack sx={{ gap: 1, mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Suspected correlations (not confirmed):
                    </Typography>
                    {problem.rootCauseHints.map((hint) => (
                      <Alert key={hint.key} severity="info" variant="outlined" sx={{ fontSize: 12 }}>
                        {hint.text}
                      </Alert>
                    ))}
                  </Stack>
                ) : null}
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: "100%" }}>
              <CardHeader title="Workaround" slotProps={{ title: { variant: "h6" } }} />
              <CardContent sx={{ pt: 0 }}>
                <Typography variant="body2">{problem.workaround ?? "No workaround documented."}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: "100%" }}>
              <CardHeader title="Remediation" slotProps={{ title: { variant: "h6" } }} />
              <CardContent sx={{ pt: 0 }}>
                <Typography variant="body2">{problem.remediation ?? "No permanent remediation documented yet."}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Card>
          <CardHeader title="Reliability Impact" slotProps={{ title: { variant: "h6" } }} />
          <CardContent sx={{ pt: 0 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Incidents
                </Typography>
                <Typography variant="body2">{problem.impact.incidentCount}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  HIGH/CRITICAL
                </Typography>
                <Typography variant="body2">{problem.impact.highCriticalIncidentCount}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  MTTR
                </Typography>
                <Typography variant="body2">{formatDuration(problem.impact.avgMttrMs)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Total Downtime
                </Typography>
                <Typography variant="body2">{formatDuration(problem.impact.totalIncidentDurationMs)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  First Incident
                </Typography>
                <Typography variant="body2">{problem.impact.firstIncidentAt ? formatDateTime(problem.impact.firstIncidentAt) : "-"}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Last Incident
                </Typography>
                <Typography variant="body2">{problem.impact.lastIncidentAt ? formatDateTime(problem.impact.lastIncidentAt) : "-"}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="overline" color="text.secondary">
                  Affected Projects
                </Typography>
                <Typography variant="body2">{problem.impact.affectedProjectIds.length}</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {problem.sloImpact.length > 0 ? (
          <Card>
            <CardHeader title="SLO Impact" slotProps={{ title: { variant: "h6" } }} />
            <CardContent sx={{ pt: 0 }}>
              <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
                Breach counts are a time-window correlation with the problem's open period, not a proven causal link.
              </Alert>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>SLO</TableCell>
                      <TableCell>Current Status</TableCell>
                      <TableCell align="right">Breaches During Problem Window</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {problem.sloImpact.map((slo) => (
                      <TableRow key={slo.sloId} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/platform/slo/${slo.sloId}`)}>
                        <TableCell>{slo.sloName}</TableCell>
                        <TableCell>{slo.currentStatus}</TableCell>
                        <TableCell align="right">{slo.breachesDuringProblemWindow}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Related Incidents"
            slotProps={{ title: { variant: "h6" } }}
            action={
              <Button size="small" startIcon={<LinkOutlinedIcon fontSize="small" />} onClick={() => setLinkIncidentOpen(true)}>
                Link Incident
              </Button>
            }
          />
          <CardContent sx={{ pt: 0 }}>
            {problem.relatedIncidents.length === 0 ? (
              <EmptyState message="No incidents linked yet." minHeight={120} />
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Incident</TableCell>
                      <TableCell>Severity</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell>Postmortem</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {problem.relatedIncidents.map((incident) => {
                      const pm = problem.postmortems.find((p) => p.incidentId === incident.id);
                      return (
                        <TableRow key={incident.id} hover>
                          <TableCell sx={{ cursor: "pointer" }} onClick={() => navigate(`/incidents/${incident.id}`)}>
                            {incident.title}
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={incident.severity} sx={{ backgroundColor: `${severityColors[incident.severity]}1f`, color: severityColors[incident.severity] }} />
                          </TableCell>
                          <TableCell>{incident.resolved ? "Resolved" : "Open"}</TableCell>
                          <TableCell>{formatDateTime(incident.createdAt)}</TableCell>
                          <TableCell>
                            {pm?.hasPostmortem ? `${pm.postmortemStatus} (${pm.openActionItems} open items)` : "None"}
                          </TableCell>
                          <TableCell align="right">
                            <IconButton size="small" onClick={() => unlinkIncidentMutation.mutate({ problemId: id, incidentId: String(incident.id) })}>
                              <LinkOffOutlinedIcon fontSize="small" />
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

        <Card>
          <CardHeader
            title="Related Changes"
            slotProps={{ title: { variant: "h6" } }}
            action={
              <Button size="small" startIcon={<LinkOutlinedIcon fontSize="small" />} onClick={() => setLinkChangeOpen(true)}>
                Link Change
              </Button>
            }
          />
          <CardContent sx={{ pt: 0 }}>
            {problem.relatedChanges.length === 0 ? (
              <EmptyState message="No changes linked yet." minHeight={100} />
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Change</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Risk</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {problem.relatedChanges.map((change) => (
                      <TableRow key={change.id} hover>
                        <TableCell sx={{ cursor: "pointer" }} onClick={() => navigate(`/changes/${change.id}`)}>
                          {change.title}
                        </TableCell>
                        <TableCell>{change.status}</TableCell>
                        <TableCell>{change.risk}</TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => unlinkChangeMutation.mutate({ problemId: id, changeId: String(change.id) })}>
                            <LinkOffOutlinedIcon fontSize="small" />
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

        {/* Phase 36 "Enterprise Remediation & Change Effectiveness
            Intelligence" - nur sichtbar, wenn mindestens ein Change
            verknuepft ist (die Komponente selbst zeigt sonst nur eine
            Leerstelle, die hier vermieden wird, um die Seite nicht zu
            ueberladen). */}
        {problem.relatedChanges.length > 0 ? <RemediationEffectiveness problemId={id} /> : null}
      </Stack>

      <EditProblemDialog open={editOpen} onClose={() => setEditOpen(false)} problem={problem} />
      <LinkIncidentDialog open={linkIncidentOpen} onClose={() => setLinkIncidentOpen(false)} problemId={id} />
      <LinkChangeDialog open={linkChangeOpen} onClose={() => setLinkChangeOpen(false)} problemId={id} />

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete problem "{problem.title}"?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">This permanently deletes the problem and its incident/change links. This cannot be undone.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
            onClick={() => {
              deleteMutation.mutate(id, { onSuccess: () => navigate("/problems") });
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}

function EditProblemDialog({ open, onClose, problem }: { open: boolean; onClose: () => void; problem: NonNullable<ReturnType<typeof useProblem>["data"]> }) {
  const updateMutation = useUpdateProblem();
  const membersQuery = useOrganizationMembers(problem.organizationId);

  const [title, setTitle] = useState(problem.title);
  const [description, setDescription] = useState(problem.description ?? "");
  const [status, setStatus] = useState<ProblemStatus>(problem.status);
  const [priority, setPriority] = useState<ProblemPriority>(problem.priority);
  const [ownerUserId, setOwnerUserId] = useState(problem.ownerUserId ?? "");
  const [rootCause, setRootCause] = useState(problem.rootCause ?? "");
  const [workaround, setWorkaround] = useState(problem.workaround ?? "");
  const [remediation, setRemediation] = useState(problem.remediation ?? "");

  useEffect(() => {
    if (!open) return;
    setTitle(problem.title);
    setDescription(problem.description ?? "");
    setStatus(problem.status);
    setPriority(problem.priority);
    setOwnerUserId(problem.ownerUserId ?? "");
    setRootCause(problem.rootCause ?? "");
    setWorkaround(problem.workaround ?? "");
    setRemediation(problem.remediation ?? "");
    updateMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, problem]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Problem</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <TextField label="Title" size="small" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <TextField label="Description" size="small" value={description} onChange={(event) => setDescription(event.target.value)} multiline minRows={2} />
          <Stack direction="row" sx={{ gap: 2 }}>
            <TextField select label="Status" size="small" value={status} onChange={(event) => setStatus(event.target.value as ProblemStatus)} fullWidth>
              {PROBLEM_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Priority" size="small" value={priority} onChange={(event) => setPriority(event.target.value as ProblemPriority)} fullWidth>
              {PROBLEM_PRIORITIES.map((p) => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField select label="Owner" size="small" value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)}>
            <MenuItem value="">Unassigned</MenuItem>
            {(membersQuery.data ?? []).map((member) => (
              <MenuItem key={member.userId} value={member.userId}>
                {member.userName}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Root Cause" size="small" value={rootCause} onChange={(event) => setRootCause(event.target.value)} multiline minRows={2} />
          <TextField label="Workaround" size="small" value={workaround} onChange={(event) => setWorkaround(event.target.value)} multiline minRows={2} />
          <TextField label="Remediation" size="small" value={remediation} onChange={(event) => setRemediation(event.target.value)} multiline minRows={2} />
          {updateMutation.isError ? <Alert severity="error">{getErrorMessage(updateMutation.error)}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!title.trim() || updateMutation.isPending}
          onClick={() => {
            updateMutation.mutate(
              {
                id: String(problem.id),
                input: {
                  title: title.trim(),
                  description: description.trim() ? description.trim() : null,
                  status,
                  priority,
                  ownerUserId: ownerUserId ? ownerUserId : null,
                  rootCause: rootCause.trim() ? rootCause.trim() : null,
                  workaround: workaround.trim() ? workaround.trim() : null,
                  remediation: remediation.trim() ? remediation.trim() : null,
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

function LinkIncidentDialog({ open, onClose, problemId }: { open: boolean; onClose: () => void; problemId: string }) {
  const linkMutation = useLinkIncident();
  const [incidentId, setIncidentId] = useState("");

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Link Incident</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <TextField label="Incident ID" size="small" value={incidentId} onChange={(event) => setIncidentId(event.target.value)} autoFocus required />
          {linkMutation.isError ? <Alert severity="error">{getErrorMessage(linkMutation.error)}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { setIncidentId(""); linkMutation.reset(); onClose(); }}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!incidentId.trim() || linkMutation.isPending}
          onClick={() => {
            linkMutation.mutate(
              { problemId, incidentId: incidentId.trim() },
              { onSuccess: () => { setIncidentId(""); onClose(); } },
            );
          }}
        >
          Link
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function LinkChangeDialog({ open, onClose, problemId }: { open: boolean; onClose: () => void; problemId: string }) {
  const linkMutation = useLinkChange();
  const [changeId, setChangeId] = useState("");

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Link Change</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <TextField label="Change ID" size="small" value={changeId} onChange={(event) => setChangeId(event.target.value)} autoFocus required />
          {linkMutation.isError ? <Alert severity="error">{getErrorMessage(linkMutation.error)}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { setChangeId(""); linkMutation.reset(); onClose(); }}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!changeId.trim() || linkMutation.isPending}
          onClick={() => {
            linkMutation.mutate(
              { problemId, changeId: changeId.trim() },
              { onSuccess: () => { setChangeId(""); onClose(); } },
            );
          }}
        >
          Link
        </Button>
      </DialogActions>
    </Dialog>
  );
}
