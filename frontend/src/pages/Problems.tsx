import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { StatsCard } from "../components/dashboard/StatsCard";
import { useOrganizations, useOrganizationMembers } from "../hooks/useOrganizations";
import { useCreateProblem, useProblemCandidates, useProblems } from "../hooks/useProblems";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime, formatDuration } from "../utils/formatters";
import { healthStatusColors } from "../theme/statusColors";
import { PROBLEM_PRIORITIES, PROBLEM_STATUSES } from "../types/problem.types";
import type { ProblemPriority, ProblemStatus } from "../types/problem.types";

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
// Auftragspunkt 23 "Frontend" - eigene, fokussierte Seite statt die
// bestehende IncidentDetail-Seite zu ueberladen (Auftrag explizit).
export function Problems() {
  const navigate = useNavigate();
  const [organizationId, setOrganizationId] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProblemStatus | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<ProblemPriority | "ALL">("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [prefillTitle, setPrefillTitle] = useState("");

  const organizationsQuery = useOrganizations();

  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current) return;
    const firstOrg = organizationsQuery.data?.[0];
    if (firstOrg) {
      hasAutoSelected.current = true;
      setOrganizationId(firstOrg.id);
    }
  }, [organizationsQuery.data]);

  const enabled = Boolean(organizationId);
  const problemsQuery = useProblems(
    {
      organizationId,
      ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
      ...(priorityFilter !== "ALL" ? { priority: priorityFilter } : {}),
    },
    enabled,
  );
  const candidatesQuery = useProblemCandidates({ organizationId, hours: 24 * 30 }, enabled);
  const membersQuery = useOrganizationMembers(organizationId || undefined);
  const memberNameById = new Map((membersQuery.data ?? []).map((member) => [member.userId, member.userName]));

  const counts = problemsQuery.data?.counts;
  const problems = problemsQuery.data?.problems ?? [];

  return (
    <PageContainer title="Problem Management">
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 2, justifyContent: "space-between" }}>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
              <TextField select size="small" label="Organization" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} sx={{ minWidth: 200 }}>
                {(organizationsQuery.data ?? []).map((org) => (
                  <MenuItem key={org.id} value={org.id}>
                    {org.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ProblemStatus | "ALL")} sx={{ minWidth: 160 }}>
                <MenuItem value="ALL">All statuses</MenuItem>
                {PROBLEM_STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as ProblemPriority | "ALL")} sx={{ minWidth: 150 }}>
                <MenuItem value="ALL">All priorities</MenuItem>
                {PROBLEM_PRIORITIES.map((p) => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Button
              variant="contained"
              onClick={() => {
                setPrefillTitle("");
                setCreateOpen(true);
              }}
              disabled={!organizationId}
            >
              New Problem
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {!organizationId ? (
        <EmptyState message="Select an organization to view its problems." minHeight={240} />
      ) : (
        <Stack sx={{ gap: 3 }}>
          <Section title="Problem Overview">
            {problemsQuery.isLoading ? (
              <LoadingState label="Loading problems..." minHeight={140} />
            ) : problemsQuery.isError ? (
              <ErrorState message={getErrorMessage(problemsQuery.error)} onRetry={() => problemsQuery.refetch()} minHeight={140} />
            ) : counts ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Open" value={counts.open} accentColor={healthStatusColors.critical} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Investigating" value={counts.investigating} accentColor={healthStatusColors.warning} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Known Errors" value={counts.knownError} accentColor={healthStatusColors.warning} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Mitigated" value={counts.mitigated} accentColor={healthStatusColors.warning} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Resolved" value={counts.resolved} accentColor={healthStatusColors.healthy} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatsCard label="Critical Problems" value={counts.criticalCount} accentColor={healthStatusColors.critical} />
                </Grid>
              </Grid>
            ) : null}
          </Section>

          <Section title="Problems">
            {problemsQuery.isLoading ? (
              <LoadingState label="Loading problems..." minHeight={240} />
            ) : problemsQuery.isError ? (
              <ErrorState message={getErrorMessage(problemsQuery.error)} onRetry={() => problemsQuery.refetch()} minHeight={240} />
            ) : problems.length === 0 ? (
              <EmptyState message="No problems match the current filter." minHeight={240} />
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Problem</TableCell>
                      <TableCell>Priority</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Owner</TableCell>
                      <TableCell align="right">Incidents</TableCell>
                      <TableCell align="right">Critical Incidents</TableCell>
                      <TableCell>Last Incident</TableCell>
                      <TableCell align="right">SLO Impact</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {problems.map((problem) => (
                      <TableRow key={problem.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/problems/${problem.id}`)}>
                        <TableCell>{problem.title}</TableCell>
                        <TableCell>
                          <Chip size="small" label={problem.priority} sx={{ backgroundColor: `${PROBLEM_PRIORITY_COLORS[problem.priority]}1f`, color: PROBLEM_PRIORITY_COLORS[problem.priority] }} />
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={problem.status} sx={{ backgroundColor: `${PROBLEM_STATUS_COLORS[problem.status]}1f`, color: PROBLEM_STATUS_COLORS[problem.status] }} />
                        </TableCell>
                        <TableCell>{problem.ownerUserId ? (memberNameById.get(problem.ownerUserId) ?? problem.ownerUserId) : "Unassigned"}</TableCell>
                        <TableCell align="right">{problem.incidentCount}</TableCell>
                        <TableCell align="right">{problem.criticalIncidentCount}</TableCell>
                        <TableCell>{problem.lastIncidentAt ? formatDateTime(problem.lastIncidentAt) : "-"}</TableCell>
                        <TableCell align="right">{problem.sloImpactCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Section>

          <Section title="Potential Problems">
            <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
              Not confirmed — these are deterministic candidates derived from recurring incident patterns, not automatically created problems.
            </Alert>
            {candidatesQuery.isLoading ? (
              <LoadingState label="Loading candidates..." minHeight={160} />
            ) : candidatesQuery.isError ? (
              <ErrorState message={getErrorMessage(candidatesQuery.error)} onRetry={() => candidatesQuery.refetch()} minHeight={160} />
            ) : (candidatesQuery.data ?? []).length === 0 ? (
              <EmptyState message="No recurring incident patterns found in the last 30 days." minHeight={160} />
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Project</TableCell>
                      <TableCell>Check</TableCell>
                      <TableCell align="right">Incidents</TableCell>
                      <TableCell align="right">Critical</TableCell>
                      <TableCell>First Seen</TableCell>
                      <TableCell>Last Seen</TableCell>
                      <TableCell align="right">Avg MTTR</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(candidatesQuery.data ?? []).map((candidate) => (
                      <TableRow key={`${candidate.checkId}-${candidate.projectId}`} hover>
                        <TableCell>{candidate.projectName}</TableCell>
                        <TableCell>{candidate.checkType}</TableCell>
                        <TableCell align="right">{candidate.incidentCount}</TableCell>
                        <TableCell align="right">{candidate.criticalCount}</TableCell>
                        <TableCell>{formatDateTime(candidate.firstIncidentAt)}</TableCell>
                        <TableCell>{formatDateTime(candidate.lastIncidentAt)}</TableCell>
                        <TableCell align="right">{formatDuration(candidate.avgMttrMs)}</TableCell>
                        <TableCell align="right">
                          {candidate.hasOpenProblem ? (
                            <Chip size="small" variant="outlined" label="Problem exists" />
                          ) : (
                            <Button
                              size="small"
                              onClick={() => {
                                setCreateOpen(true);
                                setPrefillTitle(`Repeated failures for ${candidate.projectName}/${candidate.checkType}`);
                              }}
                            >
                              Create Problem
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Section>
        </Stack>
      )}

      <CreateProblemDialog open={createOpen} onClose={() => setCreateOpen(false)} organizationId={organizationId} initialTitle={prefillTitle} onCreated={(id) => navigate(`/problems/${id}`)} />
    </PageContainer>
  );
}

function Section({ title, children }: { title: string; children: import("react").ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} slotProps={{ title: { variant: "h6" } }} />
      <CardContent sx={{ pt: 0 }}>{children}</CardContent>
    </Card>
  );
}

function CreateProblemDialog({
  open,
  onClose,
  organizationId,
  initialTitle,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  initialTitle: string;
  onCreated: (id: number) => void;
}) {
  const createMutation = useCreateProblem();
  const membersQuery = useOrganizationMembers(organizationId || undefined);

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<ProblemPriority>("MEDIUM");
  const [ownerUserId, setOwnerUserId] = useState("");

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setOwnerUserId("");
    createMutation.reset();
  };

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} maxWidth="sm" fullWidth>
      <DialogTitle>New Problem</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <TextField label="Title" size="small" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
          <TextField label="Description" size="small" value={description} onChange={(event) => setDescription(event.target.value)} multiline minRows={2} />
          <TextField select label="Priority" size="small" value={priority} onChange={(event) => setPriority(event.target.value as ProblemPriority)}>
            {PROBLEM_PRIORITIES.map((p) => (
              <MenuItem key={p} value={p}>
                {p}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Owner (optional)" size="small" value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)}>
            <MenuItem value="">Unassigned</MenuItem>
            {(membersQuery.data ?? []).map((member) => (
              <MenuItem key={member.userId} value={member.userId}>
                {member.userName}
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
          disabled={!title.trim() || createMutation.isPending}
          onClick={() => {
            createMutation.mutate(
              {
                organizationId,
                title: title.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
                priority,
                ...(ownerUserId ? { ownerUserId } : {}),
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
