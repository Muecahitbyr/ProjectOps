import { useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Divider from "@mui/material/Divider";
import { useCreateAutomationRule, useUpdateAutomationRule } from "../../hooks/useAutomationRules";
import { useProjectsHealth } from "../../hooks/useProjects";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { AUTOMATION_ACTION_TYPES, AUTOMATION_TRIGGERS } from "../../types/automation.types";
import type { AutomationActionType, AutomationRule, AutomationSeverity, AutomationTrigger, RecoveryRiskLevel } from "../../types/automation.types";

interface AutomationRuleFormDialogProps {
  open: boolean;
  onClose: () => void;
  rule?: AutomationRule;
}

const SEVERITY_OPTIONS: AutomationSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const RISK_LEVEL_OPTIONS: RecoveryRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
// Muss mit backend safe-action-runner.ts (AUTO_EXECUTABLE_ACTIONS) uebereinstimmen.
const AUTO_EXECUTABLE_ACTIONS = new Set<AutomationActionType>([
  "RUN_HEALTH_CHECK", "CREATE_DIAGNOSTIC_SNAPSHOT", "COLLECT_LOGS", "CLEAR_CACHE",
  "RESTART_MONITOR", "RETRY_CHECK", "RELOAD_CONFIGURATION", "FLUSH_QUEUE",
  "CREATE_BACKUP", "VERIFY_DEPENDENCIES",
]);

// Teil 1 "Automation Rules aktivieren" - Erstellen/Bearbeiten einer Regel
// mit allen in Phase 11 geforderten Feldern (trigger/priority/conditions/
// cooldown/approval_required/maxExecutionsPerHour).
export function AutomationRuleFormDialog({ open, onClose, rule }: AutomationRuleFormDialogProps) {
  const isEdit = rule !== undefined;
  const projectsQuery = useProjectsHealth();
  const createMutation = useCreateAutomationRule();
  const updateMutation = useUpdateAutomationRule(rule?.id ?? "");
  const mutation = isEdit ? updateMutation : createMutation;

  const [projectId, setProjectId] = useState(rule?.projectId ?? "");
  const [name, setName] = useState(rule?.name ?? "");
  const [trigger, setTrigger] = useState<AutomationTrigger>(rule?.trigger ?? "INCIDENT_CREATED");
  const [action, setAction] = useState<AutomationActionType>(rule?.action ?? "CREATE_DIAGNOSTIC_SNAPSHOT");
  const [minSeverity, setMinSeverity] = useState<AutomationSeverity>(rule?.minSeverity ?? "MEDIUM");
  const [checkType, setCheckType] = useState(rule?.checkType ?? "");
  const [priority, setPriority] = useState(String(rule?.priority ?? 100));
  const [cooldownMinutes, setCooldownMinutes] = useState(String(rule?.cooldownMinutes ?? 15));
  const [maxExecutionsPerHour, setMaxExecutionsPerHour] = useState(String(rule?.maxExecutionsPerHour ?? 10));
  const [approvalRequired, setApprovalRequired] = useState(rule?.approvalRequired ?? true);
  const [autoExecute, setAutoExecute] = useState(rule?.autoExecute ?? false);
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [riskLevel, setRiskLevel] = useState<RecoveryRiskLevel>(rule?.riskLevel ?? "MEDIUM");
  const [timeoutSeconds, setTimeoutSeconds] = useState(String(rule?.timeoutSeconds ?? 60));
  const [maxAttemptsPerIncident, setMaxAttemptsPerIncident] = useState(String(rule?.maxAttemptsPerIncident ?? 3));

  useEffect(() => {
    if (!open) return;
    setProjectId(rule?.projectId ?? "");
    setName(rule?.name ?? "");
    setTrigger(rule?.trigger ?? "INCIDENT_CREATED");
    setAction(rule?.action ?? "CREATE_DIAGNOSTIC_SNAPSHOT");
    setMinSeverity(rule?.minSeverity ?? "MEDIUM");
    setCheckType(rule?.checkType ?? "");
    setPriority(String(rule?.priority ?? 100));
    setCooldownMinutes(String(rule?.cooldownMinutes ?? 15));
    setMaxExecutionsPerHour(String(rule?.maxExecutionsPerHour ?? 10));
    setApprovalRequired(rule?.approvalRequired ?? true);
    setAutoExecute(rule?.autoExecute ?? false);
    setEnabled(rule?.enabled ?? true);
    setRiskLevel(rule?.riskLevel ?? "MEDIUM");
    setTimeoutSeconds(String(rule?.timeoutSeconds ?? 60));
    setMaxAttemptsPerIncident(String(rule?.maxAttemptsPerIncident ?? 3));
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule]);

  const canAutoExecute = AUTO_EXECUTABLE_ACTIONS.has(action);
  const effectiveAutoExecute = autoExecute && canAutoExecute;
  // Spiegelt die serverseitige CHECK-Constraint (Migration 0053) im UI -
  // CRITICAL-Risiko erzwingt approvalRequired=true, statt den Benutzer erst
  // nach dem Absenden mit einem 400 zu konfrontieren.
  const effectiveApprovalRequired = riskLevel === "CRITICAL" ? true : approvalRequired;

  const canSubmit = projectId.length > 0 && name.trim().length > 0;

  const handleSubmit = (): void => {
    const base = {
      name: name.trim(),
      trigger,
      action,
      minSeverity,
      priority: Number(priority) || 100,
      cooldownMinutes: Number(cooldownMinutes) || 0,
      maxExecutionsPerHour: Number(maxExecutionsPerHour) || 10,
      approvalRequired: effectiveApprovalRequired,
      autoExecute: effectiveAutoExecute,
      enabled,
      riskLevel,
      timeoutSeconds: Number(timeoutSeconds) || 60,
      maxAttemptsPerIncident: Number(maxAttemptsPerIncident) || 3,
      ...(checkType.trim() ? { checkType: checkType.trim() } : {}),
    };

    if (isEdit) {
      updateMutation.mutate(base, { onSuccess: onClose });
    } else {
      createMutation.mutate({ projectId, ...base }, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isEdit ? "Edit automation rule" : "New automation rule"}</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, pt: 1 }}>
          {mutation.isError ? <Alert severity="error">{getErrorMessage(mutation.error)}</Alert> : null}

          <TextField
            select
            label="Project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            disabled={isEdit}
            fullWidth
          >
            {(projectsQuery.data ?? []).map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} fullWidth autoFocus />

          <Stack direction="row" sx={{ gap: 2 }}>
            <TextField select label="Trigger" value={trigger} onChange={(event) => setTrigger(event.target.value as AutomationTrigger)} fullWidth>
              {AUTOMATION_TRIGGERS.map((option) => (
                <MenuItem key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Min. severity" value={minSeverity} onChange={(event) => setMinSeverity(event.target.value as AutomationSeverity)} sx={{ width: 160 }}>
              {SEVERITY_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <TextField
            select
            label="Action"
            value={action}
            onChange={(event) => setAction(event.target.value as AutomationActionType)}
            fullWidth
            helperText={canAutoExecute ? undefined : "This action has no execution logic - it will always remain a proposal."}
          >
            {AUTOMATION_ACTION_TYPES.map((option) => (
              <MenuItem key={option} value={option}>
                {option.replaceAll("_", " ")}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Check type (optional)"
            value={checkType}
            onChange={(event) => setCheckType(event.target.value)}
            helperText="Leave empty to match all check types"
            fullWidth
          />

          <Divider />

          <Stack direction="row" sx={{ gap: 2 }}>
            <TextField label="Priority" type="number" value={priority} onChange={(event) => setPriority(event.target.value)} helperText="Lower runs first" fullWidth />
            <TextField label="Cooldown (min)" type="number" value={cooldownMinutes} onChange={(event) => setCooldownMinutes(event.target.value)} fullWidth />
            <TextField label="Max/hour" type="number" value={maxExecutionsPerHour} onChange={(event) => setMaxExecutionsPerHour(event.target.value)} fullWidth />
          </Stack>

          <Stack direction="row" sx={{ gap: 2 }}>
            <TextField
              select
              label="Recovery risk"
              value={riskLevel}
              onChange={(event) => setRiskLevel(event.target.value as RecoveryRiskLevel)}
              helperText="CRITICAL always requires approval"
              fullWidth
            >
              {RISK_LEVEL_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Timeout (sec)" type="number" value={timeoutSeconds} onChange={(event) => setTimeoutSeconds(event.target.value)} fullWidth />
            <TextField
              label="Max attempts / incident"
              type="number"
              value={maxAttemptsPerIncident}
              onChange={(event) => setMaxAttemptsPerIncident(event.target.value)}
              fullWidth
            />
          </Stack>

          <FormControlLabel
            control={
              <Switch checked={effectiveApprovalRequired} disabled={riskLevel === "CRITICAL"} onChange={(event) => setApprovalRequired(event.target.checked)} />
            }
            label="Require manual approval before running"
          />
          <FormControlLabel
            control={
              <Switch
                checked={effectiveAutoExecute}
                disabled={effectiveApprovalRequired || !canAutoExecute}
                onChange={(event) => setAutoExecute(event.target.checked)}
              />
            }
            label="Auto-execute when matched (only for safe actions, and only if approval is not required)"
          />
          <FormControlLabel control={<Switch checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />} label="Enabled" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!canSubmit || mutation.isPending}>
          {isEdit ? "Save" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
