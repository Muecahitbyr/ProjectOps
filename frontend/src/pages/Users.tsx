import { useState } from "react";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { UserList } from "../components/users/UserList";
import { CreateUserDialog } from "../components/users/CreateUserDialog";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useUsers } from "../hooks/useUsers";
import { useAuth } from "../auth/AuthContext";
import { getErrorMessage } from "../utils/getErrorMessage";

export function Users() {
  const usersQuery = useUsers();
  const { isGlobalAdmin } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <PageContainer title="Users">
      {isGlobalAdmin && (
        <Stack direction="row" sx={{ justifyContent: "flex-end", mb: 3 }}>
          <Button variant="contained" startIcon={<PersonAddOutlinedIcon />} onClick={() => setDialogOpen(true)}>
            New user
          </Button>
        </Stack>
      )}

      {usersQuery.isLoading ? (
        <LoadingState label="Loading users..." minHeight={300} />
      ) : usersQuery.isError ? (
        <ErrorState message={getErrorMessage(usersQuery.error)} onRetry={() => usersQuery.refetch()} />
      ) : (
        <UserList users={usersQuery.data ?? []} />
      )}

      <CreateUserDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </PageContainer>
  );
}
