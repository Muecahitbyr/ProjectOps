import { useState } from "react";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { UserAvatar } from "./UserAvatar";
import { EmptyState } from "../common/EmptyState";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { useProjectMembers, useAddProjectMember, useRemoveProjectMember } from "../../hooks/useProjectMembers";
import { useUsers, useRoles } from "../../hooks/useUsers";
import { useAuth } from "../../auth/AuthContext";
import { getErrorMessage } from "../../utils/getErrorMessage";
import type { RoleId } from "../../types/user.types";

const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

interface ProjectMembersPanelProps {
  projectId: string;
}

// Verwaltet die echten project_members-Zeilen fuer ein Projekt (Rolle je
// Mitgliedschaft) - Nutzerauswahl beschraenkt sich bewusst auf bereits
// bestehende Benutzer (users.repository.ts), keine Einladung per E-Mail
// (nicht Teil des Auftrags).
export function ProjectMembersPanel({ projectId }: ProjectMembersPanelProps) {
  const membersQuery = useProjectMembers(projectId);
  const usersQuery = useUsers();
  const rolesQuery = useRoles();
  const addMutation = useAddProjectMember(projectId);
  const removeMutation = useRemoveProjectMember(projectId);
  const { hasProjectRole } = useAuth();
  const canManage = hasProjectRole(projectId, MANAGE_ROLES);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<RoleId>("VIEWER");

  if (membersQuery.isLoading) {
    return <LoadingState label="Loading members..." minHeight={160} />;
  }
  if (membersQuery.isError) {
    return <ErrorState message={getErrorMessage(membersQuery.error)} onRetry={() => membersQuery.refetch()} />;
  }

  const members = membersQuery.data ?? [];
  const memberUserIds = new Set(members.map((member) => member.userId));
  const availableUsers = (usersQuery.data ?? []).filter((user) => !memberUserIds.has(user.id));

  const handleAdd = (): void => {
    if (!selectedUserId) return;
    addMutation.mutate(
      { userId: selectedUserId, roleId: selectedRoleId },
      { onSuccess: () => setSelectedUserId("") },
    );
  };

  return (
    <Stack sx={{ gap: 2 }}>
      {members.length === 0 ? (
        <EmptyState message="No members assigned to this project yet." minHeight={100} />
      ) : (
        <Stack divider={<Divider />}>
          {members.map((member) => (
            <Stack key={member.id} direction="row" sx={{ alignItems: "center", justifyContent: "space-between", py: 1 }}>
              <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, minWidth: 0 }}>
                <UserAvatar name={member.user.name} avatar={member.user.avatar} online={false} size={32} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {member.user.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {member.user.email}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                <Chip size="small" label={member.roleId} variant="outlined" />
                {canManage && (
                  <IconButton
                    size="small"
                    aria-label="Remove member"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(member.userId)}
                  >
                    <DeleteOutlineOutlinedIcon fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}

      {canManage && (
      <Stack direction="row" sx={{ gap: 1.5, alignItems: "flex-start" }}>
        <TextField
          select
          label="Add user"
          size="small"
          value={selectedUserId}
          onChange={(event) => setSelectedUserId(event.target.value)}
          disabled={availableUsers.length === 0}
          sx={{ flexGrow: 1, minWidth: 0 }}
        >
          {availableUsers.map((user) => (
            <MenuItem key={user.id} value={user.id}>
              {user.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Role"
          size="small"
          value={selectedRoleId}
          onChange={(event) => setSelectedRoleId(event.target.value as RoleId)}
          sx={{ width: 140 }}
        >
          {(rolesQuery.data ?? []).map((role) => (
            <MenuItem key={role.id} value={role.id}>
              {role.id}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="contained"
          onClick={handleAdd}
          disabled={!selectedUserId || addMutation.isPending}
          sx={{ height: 40 }}
        >
          Add
        </Button>
      </Stack>
      )}
    </Stack>
  );
}
