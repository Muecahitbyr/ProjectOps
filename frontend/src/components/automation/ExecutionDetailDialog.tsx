import { useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import { useExecutionLogs, useExecutionOutcome } from "../../hooks/useAutomationExecutions";
import { subscribeRealtimeEvents } from "../../realtime/realtimeClient";
import { formatDateTime, formatDuration } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import type { AutomationExecution, AutomationLog } from "../../types/automation.types";
import type { AutomationExecutionOutcomeStatus, OutcomeDurability } from "../../types/automation-outcome.types";

interface ExecutionDetailDialogProps {
  execution: AutomationExecution | null;
  onClose: () => void;
}

const STATUS_COLORS: Record<AutomationExecution["status"], string> = {
  CREATED: "#94a3b8",
  APPROVED: "#60a5fa",
  RUNNING: healthStatusColors.warning,
  SUCCESS: healthStatusColors.healthy,
  FAILED: healthStatusColors.critical,
  CANCELLED: "#94a3b8",
};

const LEVEL_COLORS: Record<AutomationLog["level"], string> = {
  INFO: "#94a3b8",
  WARN: healthStatusColors.warning,
  ERROR: healthStatusColors.critical,
};

// Phase 52 "Continuous Operational Assurance".
const DURABILITY_COLORS: Record<OutcomeDurability, string> = {
  MONITORING: "#94a3b8",
  DURABLE: healthStatusColors.healthy,
  REGRESSED: healthStatusColors.critical,
};

// Phase 51 "Enterprise Decision Execution & Closed-Loop Operations".
const OUTCOME_COLORS: Record<AutomationExecutionOutcomeStatus, string> = {
  IMPROVED: healthStatusColors.healthy,
  REGRESSED: healthStatusColors.critical,
  NOT_IMPROVED: healthStatusColors.warning,
  PENDING: "#94a3b8",
  NOT_APPLICABLE: "#94a3b8",
};

// Teil 6 "Execution Logs" - laedt die bisherigen Log-Zeilen und haengt live
// per WebSocket ankommende EXECUTION_LOG-Events fuer GENAU diese Ausfuehrung
// an, solange der Dialog offen ist (kein Polling).
export function ExecutionDetailDialog({ execution, onClose }: ExecutionDetailDialogProps) {
  const logsQuery = useExecutionLogs(execution?.id ?? "");
  // Phase 51 "Enterprise Decision Execution & Closed-Loop Operations" - nur
  // fuer technisch erfolgreiche, echte (nicht Dry-Run) Ausfuehrungen sinnvoll
  // abfragbar (core/automation-outcome-verification.ts liefert fuer alle
  // anderen Faelle ohnehin NOT_APPLICABLE, aber die Abfrage selbst spart man
  // sich hier).
  const outcomeQuery = useExecutionOutcome(execution?.id ?? "", Boolean(execution && execution.status === "SUCCESS" && !execution.dryRun));
  const [liveLogs, setLiveLogs] = useState<AutomationLog[]>([]);

  useEffect(() => {
    setLiveLogs([]);
    if (!execution) return;
    return subscribeRealtimeEvents((event) => {
      if (event.type === "EXECUTION_LOG" && event.payload.executionId === execution.id) {
        setLiveLogs((current) => [...current, event.payload]);
      }
    });
  }, [execution]);

  if (!execution) return null;

  const baseLogs = logsQuery.data ?? [];
  const seenIds = new Set(baseLogs.map((log) => log.id));
  const logs = [...baseLogs, ...liveLogs.filter((log) => !seenIds.has(log.id))];

  return (
    <Dialog open={execution !== null} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
          Execution #{execution.id}
          <Chip size="small" label={execution.status} sx={{ backgroundColor: `${STATUS_COLORS[execution.status]}1f`, color: STATUS_COLORS[execution.status] }} />
          {execution.dryRun ? <Chip size="small" variant="outlined" label="Dry run" /> : null}
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 1.5, mb: 2 }}>
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Typography variant="body2" color="text.secondary">Started</Typography>
            <Typography variant="body2">{formatDateTime(execution.startedAt)}</Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Typography variant="body2" color="text.secondary">Duration</Typography>
            <Typography variant="body2">{formatDuration(execution.durationMs)}</Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Typography variant="body2" color="text.secondary">Executed by</Typography>
            <Typography variant="body2">{execution.executedBy ?? "System (automatic)"}</Typography>
          </Stack>
          {execution.error ? (
            <Typography variant="body2" color="error">
              {execution.error}
            </Typography>
          ) : null}
          {outcomeQuery.data ? (
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="body2" color="text.secondary">
                Operational outcome
              </Typography>
              <Chip
                size="small"
                label={outcomeQuery.data.status.replace("_", " ")}
                sx={{ backgroundColor: `${OUTCOME_COLORS[outcomeQuery.data.status]}1f`, color: OUTCOME_COLORS[outcomeQuery.data.status] }}
              />
            </Stack>
          ) : null}
          {outcomeQuery.data ? (
            <Typography variant="caption" color="text.secondary">
              {outcomeQuery.data.reason}
            </Typography>
          ) : null}
          {outcomeQuery.data?.durability ? (
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="body2" color="text.secondary">
                Durability
              </Typography>
              <Chip
                size="small"
                label={outcomeQuery.data.durability}
                sx={{ backgroundColor: `${DURABILITY_COLORS[outcomeQuery.data.durability]}1f`, color: DURABILITY_COLORS[outcomeQuery.data.durability] }}
              />
            </Stack>
          ) : null}
          {outcomeQuery.data?.durabilityReason ? (
            <Typography variant="caption" color="text.secondary">
              {outcomeQuery.data.durabilityReason}
            </Typography>
          ) : null}
        </Stack>

        <Divider sx={{ mb: 1.5 }} />
        <Typography variant="overline" color="text.secondary">
          Logs
        </Typography>
        <Box sx={{ maxHeight: 300, overflowY: "auto", fontFamily: "monospace", fontSize: 13 }}>
          {logs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No log entries yet.
            </Typography>
          ) : (
            logs.map((log) => (
              <Stack key={log.id} direction="row" sx={{ gap: 1, py: 0.25 }}>
                <Typography component="span" variant="body2" sx={{ color: "text.secondary", fontFamily: "inherit" }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </Typography>
                <Typography component="span" variant="body2" sx={{ color: LEVEL_COLORS[log.level], fontWeight: 600, fontFamily: "inherit" }}>
                  {log.level}
                </Typography>
                <Typography component="span" variant="body2" sx={{ fontFamily: "inherit" }}>
                  {log.message}
                </Typography>
              </Stack>
            ))
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
