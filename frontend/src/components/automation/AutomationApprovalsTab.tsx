import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useAutomationActions, useUpdateAutomationActionStatus } from "../../hooks/useAutomationActions";
import { useAuth } from "../../auth/AuthContext";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatRelativeTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import type { RoleId } from "../../types/user.types";

const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

// Teil 4 "Approval Workflow": status=PROPOSED entspricht WAITING_APPROVAL
// (kein eigener DB-Wert, siehe backend automation-engine.ts). Nur OWNER/ADMIN
// des jeweiligen Projekts duerfen freigeben/ablehnen.
export function AutomationApprovalsTab() {
  const query = useAutomationActions(undefined, "PROPOSED");
  const updateMutation = useUpdateAutomationActionStatus();
  const { hasProjectRole } = useAuth();

  if (query.isLoading) {
    return <LoadingState label="Loading pending approvals..." minHeight={200} />;
  }
  if (query.isError) {
    return <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={200} />;
  }

  const actions = query.data ?? [];
  if (actions.length === 0) {
    return <EmptyState message="No automations are waiting for approval." minHeight={200} />;
  }

  return (
    <Stack sx={{ gap: 1.5 }}>
      {actions.map((action) => {
        const canManage = hasProjectRole(action.projectId, MANAGE_ROLES);
        return (
          <Card key={action.id}>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                <Stack sx={{ minWidth: 0 }}>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      {action.action}
                    </Typography>
                    <Chip
                      size="small"
                      label="Waiting approval"
                      sx={{ backgroundColor: `${healthStatusColors.warning}1f`, color: healthStatusColors.warning }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {action.projectId} · {action.trigger} · {formatRelativeTime(action.createdAt)}
                  </Typography>
                </Stack>
                {canManage && (
                  <Stack direction="row" sx={{ gap: 1 }}>
                    <Button
                      size="small"
                      onClick={() => updateMutation.mutate({ id: action.id, status: "REJECTED" })}
                      disabled={updateMutation.isPending}
                    >
                      Reject
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => updateMutation.mutate({ id: action.id, status: "APPROVED" })}
                      disabled={updateMutation.isPending}
                    >
                      Approve
                    </Button>
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}
