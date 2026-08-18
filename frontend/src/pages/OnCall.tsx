import { useEffect, useRef, useState } from "react";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
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
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { PageContainer } from "../components/layout/PageContainer";
import { EscalationPoliciesPanel } from "../components/oncall/EscalationPoliciesPanel";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useOrganizations } from "../hooks/useOrganizations";
import { useTeams, useTeamMembers } from "../hooks/useTeams";
import {
  useOnCallSchedules,
  useOnCallScheduleMembers,
  useCurrentOnCall,
  useOnCallOverrides,
  useOnCallTimeline,
  useCreateOnCallSchedule,
  useDeleteOnCallSchedule,
  useReplaceOnCallScheduleMembers,
  useCreateOnCallOverride,
  useDeleteOnCallOverride,
} from "../hooks/useOnCall";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime } from "../utils/formatters";
import { ON_CALL_ROTATION_TYPES } from "../types/on-call.types";
import type { OnCallRotationType, OnCallSchedule } from "../types/on-call.types";

function toIsoOrEmpty(localValue: string): string {
  if (!localValue) return "";
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

// Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" - Frontend,
// demselben Aufbau wie SloOverview.tsx/ServiceCatalog.tsx folgend (Phase
// 22/23): Filterleiste + Tabelle + Create-Dialog, Detailbereich fuer ein
// ausgewaehltes Schedule statt einer eigenen Route (die Anzahl an Schedules
// ist durch die Plan-Quota klein genug, siehe config/plan-limits.ts).
export function OnCall() {
  const [organizationId, setOrganizationId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OnCallSchedule | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const organizationsQuery = useOrganizations();
  const teamsQuery = useTeams(organizationId || undefined);

  // Auftragspunkt "Sichtbarkeit fuer reguläre Organisationsmitglieder" - live
  // im Browser-Test gefunden: ohne organizationId-Filter verlangt das Backend
  // echten Platform Owner/Global Admin (Bootstrap-Uebersicht, siehe
  // middleware/authorize.ts), was ein regulaerer ORGANIZATION_OWNER nicht
  // ist - "All organizations" als Startzustand liess die Seite fuer die
  // meisten legitimen Nutzer mit einem 403 statt Daten starten. Waehlt
  // daher EINMALIG die erste sichtbare Organisation vor, sobald geladen
  // (globale Platform-Owner koennen jederzeit manuell auf "All
  // organizations" zurueckwechseln, dieser Effekt greift dann nicht erneut).
  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current) return;
    const firstOrg = organizationsQuery.data?.[0];
    if (firstOrg) {
      hasAutoSelected.current = true;
      setOrganizationId(firstOrg.id);
    }
  }, [organizationsQuery.data]);

  const schedulesQuery = useOnCallSchedules({
    ...(organizationId ? { organizationId } : {}),
    ...(teamId ? { teamId } : {}),
  });
  const deleteMutation = useDeleteOnCallSchedule();

  const schedules = schedulesQuery.data ?? [];

  return (
    <PageContainer title="On-Call">
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
            </Stack>
            <Button variant="contained" onClick={() => setCreateOpen(true)}>
              New Schedule
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          {schedulesQuery.isLoading ? (
            <LoadingState label="Loading on-call schedules..." minHeight={200} />
          ) : schedulesQuery.isError ? (
            <ErrorState message={getErrorMessage(schedulesQuery.error)} onRetry={() => schedulesQuery.refetch()} />
          ) : schedules.length === 0 ? (
            <EmptyState message="No on-call schedules match the current filter." minHeight={200} />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Rotation</TableCell>
                    <TableCell>Currently On Call</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {schedules.map((schedule) => (
                    <TableRow
                      key={schedule.id}
                      hover
                      selected={selectedId === String(schedule.id)}
                      sx={{ cursor: "pointer" }}
                      onClick={() => setSelectedId(String(schedule.id))}
                    >
                      <TableCell>{schedule.name}</TableCell>
                      <TableCell>
                        {schedule.rotationType} &middot; {schedule.shiftLengthHours}h shifts
                      </TableCell>
                      <TableCell>
                        <CurrentOnCallCell scheduleId={String(schedule.id)} />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={schedule.enabled ? "ENABLED" : "DISABLED"} color={schedule.enabled ? "success" : "default"} variant="outlined" />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget(schedule);
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

      {selectedId ? (() => {
        const selectedSchedule = schedules.find((s) => String(s.id) === selectedId);
        return selectedSchedule ? <ScheduleDetail schedule={selectedSchedule} /> : null;
      })() : null}

      {organizationId ? <EscalationPoliciesPanel organizationId={organizationId} /> : null}

      <CreateScheduleDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete schedule "{deleteTarget?.name}"?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">This permanently deletes the schedule, its rotation, and its overrides. This cannot be undone.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (deleteTarget) {
                deleteMutation.mutate(String(deleteTarget.id), {
                  onSuccess: () => {
                    if (selectedId === String(deleteTarget.id)) setSelectedId(null);
                    setDeleteTarget(null);
                  },
                });
              }
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}

function CurrentOnCallCell({ scheduleId }: { scheduleId: string }) {
  const currentQuery = useCurrentOnCall(scheduleId);
  if (currentQuery.isLoading) return <span style={{ opacity: 0.6 }}>...</span>;
  const current = currentQuery.data;
  if (!current || current.source === "NONE" || !current.userName) {
    return <span style={{ opacity: 0.6 }}>Nobody (rotation not started)</span>;
  }
  return (
    <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
      <span>{current.userName}</span>
      {current.source === "OVERRIDE" ? <Chip size="small" label="OVERRIDE" variant="outlined" /> : null}
    </Stack>
  );
}

function CreateScheduleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const organizationsQuery = useOrganizations();
  const createMutation = useCreateOnCallSchedule();

  const [organizationId, setOrganizationId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [name, setName] = useState("");
  const [rotationType, setRotationType] = useState<OnCallRotationType>("WEEKLY");
  const [shiftLengthHours, setShiftLengthHours] = useState("168");
  const [rotationStart, setRotationStart] = useState("");
  const teamsQuery = useTeams(organizationId || undefined);

  const reset = () => {
    setOrganizationId("");
    setTeamId("");
    setName("");
    setRotationType("WEEKLY");
    setShiftLengthHours("168");
    setRotationStart("");
  };

  const rotationStartIso = toIsoOrEmpty(rotationStart);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New On-Call Schedule</DialogTitle>
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
            }}
            required
          >
            {(organizationsQuery.data ?? []).map((org) => (
              <MenuItem key={org.id} value={org.id}>
                {org.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Team" size="small" value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={!organizationId} required>
            {(teamsQuery.data ?? []).map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {team.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Name" size="small" value={name} onChange={(event) => setName(event.target.value)} required />
          <TextField select label="Rotation Type" size="small" value={rotationType} onChange={(event) => setRotationType(event.target.value as OnCallRotationType)}>
            {ON_CALL_ROTATION_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {type}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Shift length (hours)"
            size="small"
            type="number"
            value={shiftLengthHours}
            onChange={(event) => setShiftLengthHours(event.target.value)}
            helperText="24 for daily rotation, 168 for weekly."
          />
          <TextField
            label="Rotation start"
            type="datetime-local"
            size="small"
            value={rotationStart}
            onChange={(event) => setRotationStart(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            required
          />
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
          disabled={!organizationId || !teamId || !name.trim() || !rotationStartIso || !Number(shiftLengthHours) || createMutation.isPending}
          onClick={() => {
            createMutation.mutate(
              {
                organizationId,
                teamId,
                name: name.trim(),
                rotationType,
                shiftLengthHours: Number(shiftLengthHours),
                rotationStart: rotationStartIso,
              },
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

function ScheduleDetail({ schedule }: { schedule: OnCallSchedule }) {
  const scheduleId = String(schedule.id);
  const membersQuery = useOnCallScheduleMembers(scheduleId);
  // Bug live im Browser-Test gefunden: dieser Unterkomponente vorher lud das
  // Schedule per eigenem, UNSCOPED useOnCallSchedules()-Aufruf erneut nach,
  // nur um per scheduleId wieder herauszufiltern - fuer einen regulaeren
  // Organisationsmitglied (kein Platform Owner) schlug diese ungefilterte
  // Listenabfrage mit 403 fehl (siehe middleware/authorize.ts Bootstrap-
  // Zweig), wodurch "schedule" undefined blieb und in Folge weder
  // Team-Mitglieder noch das "Add team member"-Dropdown Daten hatten. Das
  // Schedule ist im Elternteil (OnCall()) laengst korrekt organizationId-
  // gescoped geladen - hier reicht die Weitergabe als Prop.
  const teamMembersQuery = useTeamMembers(schedule.teamId);
  const replaceMembersMutation = useReplaceOnCallScheduleMembers(scheduleId);
  const overridesQuery = useOnCallOverrides(scheduleId);
  const timelineQuery = useOnCallTimeline(scheduleId, undefined, 24 * 14);

  const [addUserId, setAddUserId] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);

  const members = membersQuery.data ?? [];
  const memberUserIds = new Set(members.map((m) => m.userId));
  const availableTeamMembers = (teamMembersQuery.data ?? []).filter((m) => !memberUserIds.has(m.userId));

  const moveMember = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= members.length) return;
    const reordered = [...members];
    const a = reordered[index];
    const b = reordered[target];
    if (!a || !b) return;
    reordered[index] = b;
    reordered[target] = a;
    replaceMembersMutation.mutate(reordered.map((m) => m.userId));
  };

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid size={{ xs: 12, md: 6 }}>
        <Card>
          <CardContent>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Rotation
            </Typography>
            {membersQuery.isLoading ? (
              <LoadingState minHeight={120} />
            ) : members.length === 0 ? (
              <EmptyState message="No participants yet - add team members below." minHeight={100} />
            ) : (
              <List disablePadding>
                {members.map((member, index) => (
                  <ListItem
                    key={member.id}
                    disableGutters
                    secondaryAction={
                      <Stack direction="row" sx={{ gap: 0.5 }}>
                        <IconButton size="small" disabled={index === 0} onClick={() => moveMember(index, -1)}>
                          <ArrowUpwardIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" disabled={index === members.length - 1} onClick={() => moveMember(index, 1)}>
                          <ArrowDownwardIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => replaceMembersMutation.mutate(members.filter((m) => m.id !== member.id).map((m) => m.userId))}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    }
                  >
                    <ListItemText primary={`${index + 1}. ${member.userName}`} secondary={member.userEmail} />
                  </ListItem>
                ))}
              </List>
            )}
            <Stack direction="row" sx={{ gap: 1, mt: 2, alignItems: "center" }}>
              <TextField select size="small" label="Add team member" value={addUserId} onChange={(event) => setAddUserId(event.target.value)} sx={{ minWidth: 220 }}>
                {availableTeamMembers.map((m) => (
                  <MenuItem key={m.userId} value={m.userId}>
                    {m.userName}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="outlined"
                size="small"
                disabled={!addUserId || replaceMembersMutation.isPending}
                onClick={() => {
                  replaceMembersMutation.mutate([...members.map((m) => m.userId), addUserId], { onSuccess: () => setAddUserId("") });
                }}
              >
                Add
              </Button>
            </Stack>
            {replaceMembersMutation.isError ? <Alert severity="error" sx={{ mt: 2 }}>{getErrorMessage(replaceMembersMutation.error)}</Alert> : null}

            <Typography variant="h4" sx={{ mt: 3, mb: 1 }}>
              Upcoming (next 14 days)
            </Typography>
            {timelineQuery.isLoading ? (
              <LoadingState minHeight={80} />
            ) : (timelineQuery.data ?? []).length === 0 ? (
              <EmptyState message="No upcoming shifts (rotation not started or no participants)." minHeight={80} />
            ) : (
              <List disablePadding dense>
                {(timelineQuery.data ?? []).map((entry, i) => {
                  const user = members.find((m) => m.userId === entry.userId);
                  return (
                    <ListItem key={i} disableGutters>
                      <ListItemText
                        primary={`${user?.userName ?? entry.userId}${entry.source === "OVERRIDE" ? " (override)" : ""}`}
                        secondary={`${formatDateTime(entry.startsAt)} - ${formatDateTime(entry.endsAt)}`}
                      />
                    </ListItem>
                  );
                })}
              </List>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Card>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="h4">Overrides</Typography>
              <Button size="small" variant="outlined" onClick={() => setOverrideOpen(true)}>
                New Override
              </Button>
            </Stack>
            {overridesQuery.isLoading ? (
              <LoadingState minHeight={120} />
            ) : (overridesQuery.data ?? []).length === 0 ? (
              <EmptyState message="No overrides." minHeight={100} />
            ) : (
              <List disablePadding>
                {(overridesQuery.data ?? []).map((override) => (
                  <OverrideRow key={override.id} scheduleId={scheduleId} override={override} />
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Grid>

      <CreateOverrideDialog open={overrideOpen} onClose={() => setOverrideOpen(false)} scheduleId={scheduleId} teamMembers={teamMembersQuery.data ?? []} />
    </Grid>
  );
}

function OverrideRow({
  scheduleId,
  override,
}: {
  scheduleId: string;
  override: { id: number; userName: string; startsAt: string; endsAt: string; reason: string | null };
}) {
  const deleteMutation = useDeleteOnCallOverride(scheduleId);
  return (
    <ListItem
      disableGutters
      secondaryAction={
        <IconButton size="small" onClick={() => deleteMutation.mutate(String(override.id))} disabled={deleteMutation.isPending}>
          <DeleteOutlinedIcon fontSize="small" />
        </IconButton>
      }
    >
      <ListItemText
        primary={`${override.userName} - ${formatDateTime(override.startsAt)} to ${formatDateTime(override.endsAt)}`}
        secondary={override.reason ?? undefined}
      />
    </ListItem>
  );
}

function CreateOverrideDialog({
  open,
  onClose,
  scheduleId,
  teamMembers,
}: {
  open: boolean;
  onClose: () => void;
  scheduleId: string;
  teamMembers: { userId: string; userName: string }[];
}) {
  const createMutation = useCreateOnCallOverride(scheduleId);
  const [userId, setUserId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  const reset = () => {
    setUserId("");
    setStartsAt("");
    setEndsAt("");
    setReason("");
  };

  const startsAtIso = toIsoOrEmpty(startsAt);
  const endsAtIso = toIsoOrEmpty(endsAt);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Override</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <TextField select label="Covering user" size="small" value={userId} onChange={(event) => setUserId(event.target.value)} required>
            {teamMembers.map((m) => (
              <MenuItem key={m.userId} value={m.userId}>
                {m.userName}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Starts" type="datetime-local" size="small" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} required />
          <TextField label="Ends" type="datetime-local" size="small" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} required />
          <TextField label="Reason (optional)" size="small" value={reason} onChange={(event) => setReason(event.target.value)} multiline minRows={2} />
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
          disabled={!userId || !startsAtIso || !endsAtIso || createMutation.isPending}
          onClick={() => {
            createMutation.mutate(
              { userId, startsAt: startsAtIso, endsAt: endsAtIso, ...(reason.trim() ? { reason: reason.trim() } : {}) },
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
