import { useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Switch from "@mui/material/Switch";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { useDeleteAlertRule, useUpdateAlertRule } from "../../hooks/useAlerts";
import { formatRelativeTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import { AlertRuleForm } from "./AlertRuleForm";
import { useAuth } from "../../auth/AuthContext";
import type { AlertRule } from "../../types/alert.types";
import type { RoleId } from "../../types/user.types";

interface AlertRuleCardProps {
  rule: AlertRule;
  projectName: string;
}

const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

const COMPARATOR_LABELS: Record<AlertRule["comparator"], string> = {
  LT: "<",
  LTE: "≤",
  GT: ">",
  GTE: "≥",
  EQ: "=",
};

// TREND/ANOMALY/COMPOSITE (Phase 9) beschreiben sich aus rule.condition statt
// aus metric/comparator/threshold (die fuer diese Typen nicht die
// eigentliche Bedingung tragen, siehe types/alert.types.ts).
function describeCondition(rule: AlertRule): string {
  if (rule.ruleType === "TREND" && rule.condition?.type === "TREND") {
    const { metric, direction, consecutivePoints, bucketMinutes } = rule.condition;
    const trend = direction === "DECREASING" ? "falling" : "rising";
    return `${metric.replace(/_/g, " ").toLowerCase()} ${trend} for ${consecutivePoints} consecutive ${bucketMinutes}m buckets`;
  }
  if (rule.ruleType === "ANOMALY" && rule.condition?.type === "ANOMALY") {
    const { metric, stdDevMultiplier, windowMinutes } = rule.condition;
    return `${metric.replace(/_/g, " ").toLowerCase()} over ${windowMinutes}m > baseline + ${stdDevMultiplier}σ`;
  }
  if (rule.ruleType === "COMPOSITE" && rule.condition?.type === "COMPOSITE") {
    const { mode, minCount, windowMinutes } = rule.condition;
    return mode === "MULTIPLE_CHECKS_OFFLINE"
      ? `≥ ${minCount} checks offline at once`
      : `≥ ${minCount} incidents in ${windowMinutes ?? 10}m`;
  }

  const comparator = COMPARATOR_LABELS[rule.comparator];
  if (rule.metric === "INCIDENT_SEVERITY") {
    return `open incident severity ${comparator} ${rule.severityThreshold}`;
  }
  const window = rule.metric === "ERROR_COUNT" && rule.windowMinutes ? ` in ${rule.windowMinutes}m` : "";
  return `${rule.metric.replace(/_/g, " ").toLowerCase()} ${comparator} ${rule.threshold}${window}`;
}

// Deckt Aktivieren/Deaktivieren (Switch, ruft PATCH enabled) und Loeschen
// direkt auf der Karte ab; Bearbeiten oeffnet dasselbe AlertRuleForm wie das
// Erstellen (rule-Prop gesetzt statt undefined).
export function AlertRuleCard({ rule, projectName }: AlertRuleCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const updateMutation = useUpdateAlertRule(rule.id);
  const deleteMutation = useDeleteAlertRule();
  const { hasProjectRole } = useAuth();
  const canManage = hasProjectRole(rule.projectId, MANAGE_ROLES);

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
          <Stack sx={{ gap: 0.5, minWidth: 0 }}>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
              <Typography variant="h4" noWrap>
                {rule.name}
              </Typography>
              {rule.ruleType !== "THRESHOLD" ? <Chip size="small" variant="outlined" label={rule.ruleType} /> : null}
              {rule.currentlyTriggered ? (
                <Chip
                  size="small"
                  label="Triggered"
                  sx={{
                    backgroundColor: `${healthStatusColors.critical}1f`,
                    color: healthStatusColors.critical,
                    border: `1px solid ${healthStatusColors.critical}40`,
                  }}
                />
              ) : null}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {projectName} · {describeCondition(rule)}
            </Typography>
            {rule.currentlyTriggered && rule.lastTriggeredValue ? (
              <Typography variant="caption" color="text.secondary">
                Last value: {rule.lastTriggeredValue} · triggered {formatRelativeTime(rule.lastTriggeredAt)}
              </Typography>
            ) : null}
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
                <IconButton
                  size="small"
                  onClick={() => deleteMutation.mutate(rule.id)}
                  aria-label="Delete rule"
                  disabled={deleteMutation.isPending}
                >
                  <DeleteOutlineOutlinedIcon fontSize="small" />
                </IconButton>
              </>
            )}
          </Stack>
        </Stack>
      </CardContent>

      <AlertRuleForm open={editOpen} onClose={() => setEditOpen(false)} rule={rule} />
    </Card>
  );
}
