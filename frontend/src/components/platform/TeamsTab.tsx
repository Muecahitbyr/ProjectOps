import { useState } from "react";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Switch from "@mui/material/Switch";
import Divider from "@mui/material/Divider";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import IconButton from "@mui/material/IconButton";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useOrganizations } from "../../hooks/useOrganizations";
import { useUsers } from "../../hooks/useUsers";
import { useProjectsHealth } from "../../hooks/useProjects";
import { useNotificationChannels } from "../../hooks/useNotificationSettings";
import {
  useAddProjectToTeam,
  useAddTeamMember,
  useCreateTeam,
  useDeleteTeam,
  useRemoveProjectFromTeam,
  useRemoveTeamMember,
  useTeamMembers,
  useTeamNotificationSettings,
  useTeamProjects,
  useTeams,
  useUpsertTeamNotificationSetting,
} from "../../hooks/useTeams";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";
import { ORGANIZATION_ROLE_IDS } from "../../types/organization.types";
import type { OrganizationRoleId } from "../../types/organization.types";
import type { Team } from "../../types/team.types";

// Phase 15 Teil 3 "Teams" - Mitglieder/Rollen/Projekte/team-spezifische
// Benachrichtigungseinstellungen. Wiederverwendet useUsers()/useProjectsHealth()/
// useNotificationChannels() (bestehende Datenquellen, Phase 7/13) statt
// paralleler Requests.
function TeamDetail({ team }: { team: Team }) {
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<OrganizationRoleId>("DEVELOPER");
  const [projectId, setProjectId] = useState("");

  const membersQuery = useTeamMembers(team.id);
  const projectsQuery = useTeamProjects(team.id);
  const notificationSettingsQuery = useTeamNotificationSettings(team.id);
  const usersQuery = useUsers();
  const allProjectsQuery = useProjectsHealth();
  const channelsQuery = useNotificationChannels();

  const addMemberMutation = useAddTeamMember(team.id);
  const removeMemberMutation = useRemoveTeamMember(team.id);
  const addProjectMutation = useAddProjectToTeam(team.id);
  const removeProjectMutation = useRemoveProjectFromTeam(team.id);
  const upsertNotificationMutation = useUpsertTeamNotificationSetting(team.id);

  const memberUserIds = new Set((membersQuery.data ?? []).map((member) => member.userId));
  const availableUsers = (usersQuery.data ?? []).filter((user) => !memberUserIds.has(user.id));

  const teamProjectIds = new Set(projectsQuery.data ?? []);
  const availableProjects = (allProjectsQuery.data ?? []).filter((project) => !teamProjectIds.has(project.id));
  const teamProjects = (allProjectsQuery.data ?? []).filter((project) => teamProjectIds.has(project.id));

  const enabledChannelIds = new Set((notificationSettingsQuery.data ?? []).filter((setting) => setting.enabled).map((setting) => setting.channelId));

  return (
    <Stack sx={{ gap: 3, mt: 2 }}>
      <Divider />

      <Stack sx={{ gap: 1 }}>
        <Typography variant="subtitle2">Members</Typography>
        {membersQuery.isLoading ? (
          <LoadingState label="Loading members..." minHeight={60} />
        ) : (membersQuery.data ?? []).length === 0 ? (
          <EmptyState message="No members yet." minHeight={60} />
        ) : (
          <Stack sx={{ gap: 0.5 }}>
            {(membersQuery.data ?? []).map((member) => (
              <Stack key={member.id} direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="body2">
                  {member.userName} ({member.userEmail}) · {member.roleId}
                </Typography>
                <IconButton size="small" onClick={() => removeMemberMutation.mutate(member.userId)} aria-label="Remove member">
                  <DeleteOutlineOutlinedIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        )}
        <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap", mt: 1 }}>
          <TextField select size="small" label="User" value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)} sx={{ minWidth: 200 }}>
            <MenuItem value="">Select a user</MenuItem>
            {availableUsers.map((user) => (
              <MenuItem key={user.id} value={user.id}>
                {user.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Role" value={memberRole} onChange={(event) => setMemberRole(event.target.value as OrganizationRoleId)} sx={{ minWidth: 160 }}>
            {ORGANIZATION_ROLE_IDS.map((role) => (
              <MenuItem key={role} value={role}>
                {role}
              </MenuItem>
            ))}
          </TextField>
          <Button
            size="small"
            startIcon={<AddOutlinedIcon />}
            disabled={!memberUserId || addMemberMutation.isPending}
            onClick={() => addMemberMutation.mutate({ userId: memberUserId, roleId: memberRole }, { onSuccess: () => setMemberUserId("") })}
          >
            Add
          </Button>
        </Stack>
      </Stack>

      <Stack sx={{ gap: 1 }}>
        <Typography variant="subtitle2">Projects</Typography>
        {projectsQuery.isLoading ? (
          <LoadingState label="Loading projects..." minHeight={60} />
        ) : teamProjects.length === 0 ? (
          <EmptyState message="No projects linked yet." minHeight={60} />
        ) : (
          <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap" }}>
            {teamProjects.map((project) => (
              <Chip key={project.id} size="small" label={project.name} onDelete={() => removeProjectMutation.mutate(project.id)} />
            ))}
          </Stack>
        )}
        <Stack direction="row" sx={{ gap: 1, alignItems: "center", mt: 1 }}>
          <TextField select size="small" label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)} sx={{ minWidth: 200 }}>
            <MenuItem value="">Select a project</MenuItem>
            {availableProjects.map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </TextField>
          <Button
            size="small"
            startIcon={<AddOutlinedIcon />}
            disabled={!projectId || addProjectMutation.isPending}
            onClick={() => addProjectMutation.mutate(projectId, { onSuccess: () => setProjectId("") })}
          >
            Link
          </Button>
        </Stack>
      </Stack>

      <Stack sx={{ gap: 1 }}>
        <Typography variant="subtitle2">Notification Channels</Typography>
        {channelsQuery.isLoading ? (
          <LoadingState label="Loading channels..." minHeight={60} />
        ) : (
          <Stack sx={{ gap: 0.5 }}>
            {(channelsQuery.data ?? []).map((channel) => (
              <Stack key={channel.id} direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="body2" color="text.secondary">
                  {channel.id}
                </Typography>
                <Switch
                  size="small"
                  checked={enabledChannelIds.has(channel.id)}
                  onChange={(event) => upsertNotificationMutation.mutate({ channelId: channel.id, enabled: event.target.checked })}
                />
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

export function TeamsTab() {
  const [organizationId, setOrganizationId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const organizationsQuery = useOrganizations();
  const teamsQuery = useTeams(organizationId || undefined);
  const createMutation = useCreateTeam();
  const deleteMutation = useDeleteTeam();

  const handleClose = (): void => {
    setDialogOpen(false);
    setName("");
    setDescription("");
    createMutation.reset();
  };

  return (
    <Stack sx={{ gap: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <TextField select label="Organization" size="small" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="">Select an organization</MenuItem>
          {(organizationsQuery.data ?? []).map((org) => (
            <MenuItem key={org.id} value={org.id}>
              {org.name}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" startIcon={<AddOutlinedIcon />} disabled={!organizationId} onClick={() => setDialogOpen(true)}>
          New team
        </Button>
      </Stack>

      {!organizationId ? (
        <EmptyState message="Select an organization to view its teams." minHeight={200} />
      ) : teamsQuery.isLoading ? (
        <LoadingState label="Loading teams..." minHeight={200} />
      ) : teamsQuery.isError || !teamsQuery.data ? (
        <ErrorState message={getErrorMessage(teamsQuery.error)} onRetry={() => teamsQuery.refetch()} minHeight={200} />
      ) : teamsQuery.data.length === 0 ? (
        <EmptyState message="No teams yet." minHeight={200} />
      ) : (
        <Stack sx={{ gap: 2 }}>
          {teamsQuery.data.map((team) => (
            <Card key={team.id}>
              <CardContent>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
                  <Stack>
                    <Typography variant="h4">{team.name}</Typography>
                    {team.description ? (
                      <Typography variant="body2" color="text.secondary">
                        {team.description}
                      </Typography>
                    ) : null}
                    <Typography variant="caption" color="text.secondary">
                      Created {formatDateTime(team.createdAt)}
                    </Typography>
                  </Stack>
                  <IconButton size="small" onClick={() => deleteMutation.mutate(team.id)} aria-label="Delete team">
                    <DeleteOutlineOutlinedIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <Button size="small" sx={{ mt: 1 }} onClick={() => setExpandedId((current) => (current === team.id ? null : team.id))}>
                  {expandedId === team.id ? "Hide details" : "Manage members, projects & alerts"}
                </Button>
                {expandedId === team.id ? <TeamDetail team={team} /> : null}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>New team</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2, pt: 1 }}>
            <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} autoFocus fullWidth />
            <TextField label="Description" value={description} onChange={(event) => setDescription(event.target.value)} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!name.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate({ organizationId, name: name.trim(), description: description.trim() || undefined }, { onSuccess: handleClose })}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
