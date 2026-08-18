import { useState } from "react";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Switch from "@mui/material/Switch";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useAutomationRules, useDeleteAutomationRule, useUpdateAutomationRule } from "../../hooks/useAutomationRules";
import { useAuth } from "../../auth/AuthContext";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { healthStatusColors } from "../../theme/statusColors";
import { AutomationRuleFormDialog } from "./AutomationRuleFormDialog";
import type { AutomationRule } from "../../types/automation.types";
import type { RoleId } from "../../types/user.types";

const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

function RuleRow({ rule }: { rule: AutomationRule }) {
  const [editOpen, setEditOpen] = useState(false);
  const updateMutation = useUpdateAutomationRule(rule.id);
  const deleteMutation = useDeleteAutomationRule();
  const { hasProjectRole } = useAuth();
  const canManage = hasProjectRole(rule.projectId, MANAGE_ROLES);

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
          <Stack sx={{ gap: 0.5, minWidth: 0 }}>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="h4" noWrap>
                {rule.name}
              </Typography>
              <Chip size="small" variant="outlined" label={rule.trigger.replaceAll("_", " ")} />
              <Chip size="small" variant="outlined" label={rule.action.replaceAll("_", " ")} />
              {rule.autoExecute ? (
                <Chip size="small" label="Auto" sx={{ backgroundColor: `${healthStatusColors.healthy}1f`, color: healthStatusColors.healthy }} />
              ) : rule.approvalRequired ? (
                <Chip size="small" label="Needs approval" sx={{ backgroundColor: `${healthStatusColors.warning}1f`, color: healthStatusColors.warning }} />
              ) : null}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {rule.projectId} · priority {rule.priority} · min severity {rule.minSeverity} · cooldown {rule.cooldownMinutes}m · max {rule.maxExecutionsPerHour}/h
              {rule.checkType ? ` · check type ${rule.checkType}` : ""}
            </Typography>
          </Stack>

          <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, flexShrink: 0 }}>
            <Switch
              checked={rule.enabled}
              disabled={!canManage}
              onChange={(event) => updateMutation.mutate({ enabled: event.target.checked })}
            />
            {canManage && (
              <>
                <IconButton size="small" onClick={() => setEditOpen(true)} aria-label="Edit rule">
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => deleteMutation.mutate(rule.id)} disabled={deleteMutation.isPending} aria-label="Delete rule">
                  <DeleteOutlineOutlinedIcon fontSize="small" />
                </IconButton>
              </>
            )}
          </Stack>
        </Stack>
      </CardContent>
      <AutomationRuleFormDialog open={editOpen} onClose={() => setEditOpen(false)} rule={rule} />
    </Card>
  );
}

export function AutomationRulesTab() {
  const query = useAutomationRules();
  const [createOpen, setCreateOpen] = useState(false);
  const { isGlobalAdmin } = useAuth();

  return (
    <Stack sx={{ gap: 2 }}>
      {isGlobalAdmin && (
        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setCreateOpen(true)}>
            New rule
          </Button>
        </Stack>
      )}

      {query.isLoading ? (
        <LoadingState label="Loading automation rules..." minHeight={200} />
      ) : query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={200} />
      ) : !query.data || query.data.length === 0 ? (
        <EmptyState message="No automation rules configured yet." minHeight={200} />
      ) : (
        <Stack sx={{ gap: 1.5 }}>
          {query.data.map((rule) => (
            <RuleRow key={rule.id} rule={rule} />
          ))}
        </Stack>
      )}

      <AutomationRuleFormDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Stack>
  );
}
