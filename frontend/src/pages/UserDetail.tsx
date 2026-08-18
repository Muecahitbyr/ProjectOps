import { useParams } from "react-router-dom";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import { PageContainer } from "../components/layout/PageContainer";
import { UserAvatar } from "../components/users/UserAvatar";
import { NotificationSettingsPanel } from "../components/users/NotificationSettingsPanel";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useUser } from "../hooks/useUsers";
import { formatDateTime, formatRelativeTime } from "../utils/formatters";
import { getErrorMessage } from "../utils/getErrorMessage";

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const userQuery = useUser(id ?? "");

  if (userQuery.isLoading) {
    return (
      <PageContainer title="User">
        <LoadingState label="Loading user..." minHeight={300} />
      </PageContainer>
    );
  }

  if (userQuery.isError || !userQuery.data) {
    return (
      <PageContainer title="User">
        <ErrorState message={getErrorMessage(userQuery.error)} onRetry={() => userQuery.refetch()} />
      </PageContainer>
    );
  }

  const user = userQuery.data;

  return (
    <PageContainer title={user.name}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Stack sx={{ alignItems: "center", textAlign: "center", gap: 1.5 }}>
                <UserAvatar name={user.name} avatar={user.avatar} online={user.presence.online} size={72} />
                <Box>
                  <Typography variant="h3">{user.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {user.email}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={user.presence.online ? "Online" : "Offline"}
                  color={user.presence.online ? "success" : "default"}
                  variant={user.presence.online ? "filled" : "outlined"}
                />
                <Typography variant="caption" color="text.secondary">
                  Last active: {formatRelativeTime(user.presence.lastActiveAt)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Member since {formatDateTime(user.createdAt)}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1.5 }}>
                Projects
              </Typography>
              {user.projects.length === 0 ? (
                <EmptyState message="No project memberships yet." minHeight={100} />
              ) : (
                <Stack sx={{ gap: 1 }}>
                  {user.projects.map((membership) => (
                    <Stack
                      key={membership.projectId}
                      direction="row"
                      sx={{ justifyContent: "space-between", alignItems: "center" }}
                    >
                      <Typography variant="body2">{membership.projectName}</Typography>
                      <Chip size="small" label={membership.roleId} variant="outlined" />
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1.5 }}>
                Notification settings
              </Typography>
              <NotificationSettingsPanel userId={user.id} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </PageContainer>
  );
}
