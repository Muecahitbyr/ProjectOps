import { useNavigate } from "react-router-dom";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import { UserAvatar } from "./UserAvatar";
import { EmptyState } from "../common/EmptyState";
import { formatRelativeTime } from "../../utils/formatters";
import type { UserWithPresence } from "../../types/user.types";

interface UserListProps {
  users: UserWithPresence[];
}

export function UserList({ users }: UserListProps) {
  const navigate = useNavigate();

  if (users.length === 0) {
    return <EmptyState message="No users yet. Add the first one." minHeight={240} />;
  }

  return (
    <Grid container spacing={3}>
      {users.map((user) => (
        <Grid key={user.id} size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardActionArea onClick={() => navigate(`/users/${user.id}`)}>
              <CardContent>
                <Stack direction="row" sx={{ gap: 2, alignItems: "center", mb: 1.5 }}>
                  <UserAvatar name={user.name} avatar={user.avatar} online={user.presence.online} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h4" noWrap>
                      {user.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {user.email}
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, mb: 1.5 }}>
                  {user.projects.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      No project memberships
                    </Typography>
                  ) : (
                    user.projects.map((membership) => (
                      <Chip
                        key={membership.projectId}
                        size="small"
                        label={`${membership.projectName} · ${membership.roleId}`}
                        variant="outlined"
                      />
                    ))
                  )}
                </Stack>

                <Typography variant="caption" color="text.secondary">
                  {user.presence.online ? "Online now" : `Last active ${formatRelativeTime(user.presence.lastActiveAt)}`}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
