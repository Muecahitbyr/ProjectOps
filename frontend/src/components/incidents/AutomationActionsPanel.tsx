import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { useAutomationActions, useUpdateAutomationActionStatus } from "../../hooks/useAutomationActions";
import { useAuth } from "../../auth/AuthContext";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatRelativeTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import type { AutomationActionStatus } from "../../types/automation.types";
import type { RoleId } from "../../types/user.types";

const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

const ACTION_LABELS: Record<string, string> = {
  RESTART_SERVICE: "Restart Service",
  CLEAR_CACHE: "Clear Cache",
  RUN_HEALTH_CHECK: "Run Health Check",
  CREATE_DIAGNOSTIC_SNAPSHOT: "Create Diagnostic Snapshot",
  COLLECT_LOGS: "Collect Logs",
};

const STATUS_COLORS: Record<AutomationActionStatus, string> = {
  PROPOSED: healthStatusColors.warning,
  APPROVED: healthStatusColors.healthy,
  REJECTED: "#94a3b8",
};

// Auftragspunkt 9 "Self Healing Vorbereitung" - zeigt Vorschlaege aus
// automation_actions (deterministisch aus dem Check-Typ eines CRITICAL-
// Incidents abgeleitet, siehe incidents/automation-suggestions.ts). Nur
// APPROVED/REJECTED-Status-Aenderung, KEINE tatsaechliche Ausfuehrung - das
// ist bewusst nicht Teil dieser Phase.
export function AutomationActionsPanel() {
  const query = useAutomationActions();
  const updateMutation = useUpdateAutomationActionStatus();
  const { hasProjectRole } = useAuth();

  if (query.isLoading) {
    return <LoadingState label="Loading automation suggestions..." minHeight={80} />;
  }
  if (query.isError) {
    return <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={80} />;
  }
  const proposed = (query.data ?? []).filter((action) => action.status === "PROPOSED");
  if (proposed.length === 0) {
    return null;
  }

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h4" sx={{ mb: 1.5 }}>
          Automation Suggestions
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          Proposed only - no action is executed automatically.
        </Typography>
        <Stack sx={{ gap: 1.5 }}>
          {proposed.map((action) => (
            <Stack key={action.id} direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              <Stack sx={{ minWidth: 0 }}>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                  <Typography variant="body2">{ACTION_LABELS[action.action] ?? action.action}</Typography>
                  <Chip size="small" label={action.status} sx={{ backgroundColor: `${STATUS_COLORS[action.status]}1f`, color: STATUS_COLORS[action.status] }} />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {action.trigger} · {formatRelativeTime(action.createdAt)}
                </Typography>
              </Stack>
              {hasProjectRole(action.projectId, MANAGE_ROLES) && (
                <Stack direction="row" sx={{ gap: 1 }}>
                  <Button size="small" onClick={() => updateMutation.mutate({ id: action.id, status: "REJECTED" })} disabled={updateMutation.isPending}>
                    Reject
                  </Button>
                  <Button size="small" variant="contained" onClick={() => updateMutation.mutate({ id: action.id, status: "APPROVED" })} disabled={updateMutation.isPending}>
                    Approve
                  </Button>
                </Stack>
              )}
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
