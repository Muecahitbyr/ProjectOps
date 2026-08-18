import type { ReactNode } from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { AGENT_STATUS_COLOR, AGENT_STATUS_LABEL } from "./officeConfig";
import type { AgentSnapshot } from "./officeConfig";
import { severityColors } from "../../theme/statusColors";
import { formatDateTime, formatDuration } from "../../utils/formatters";
import type { AttentionItem } from "../../types/attention.types";

export type OfficeSelection = { type: "agent"; agent: AgentSnapshot } | { type: "task"; task: AttentionItem } | null;

interface OfficeDetailDrawerProps {
  selection: OfficeSelection;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between" }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: "right", fontWeight: 600 }}>
        {value}
      </Typography>
    </Stack>
  );
}

// Detail-Panel fuer einen Klick auf einen Agenten (Automation Rule) oder eine
// Aufgabe (Attention Item) - zeigt ausschliesslich bereits geladene, echte
// Felder, keine zusaetzlichen API-Aufrufe.
export function OfficeDetailDrawer({ selection, onClose }: OfficeDetailDrawerProps) {
  return (
    <Drawer anchor="right" open={selection !== null} onClose={onClose} slotProps={{ paper: { sx: { width: 380, p: 3 } } }}>
      {selection?.type === "agent" ? <AgentDetail agent={selection.agent} onClose={onClose} /> : null}
      {selection?.type === "task" ? <TaskDetail task={selection.task} onClose={onClose} /> : null}
    </Drawer>
  );
}

function DrawerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <Stack direction="row" sx={{ mb: 2, alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="h3">{title}</Typography>
      <IconButton size="small" onClick={onClose} aria-label="Close">
        <CloseOutlinedIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

function AgentDetail({ agent, onClose }: { agent: AgentSnapshot; onClose: () => void }) {
  const color = AGENT_STATUS_COLOR[agent.status];
  return (
    <Box>
      <DrawerHeader title={agent.rule.name} onClose={onClose} />
      <Chip label={AGENT_STATUS_LABEL[agent.status]} sx={{ backgroundColor: `${color}1f`, color, fontWeight: 600, mb: 2 }} />
      <Stack spacing={1.5}>
        <Row label="Role" value={agent.rule.action.replace(/_/g, " ")} />
        <Row label="Trigger" value={agent.rule.trigger.replace(/_/g, " ")} />
        <Row label="Project" value={agent.rule.projectId} />
        <Row label="Priority" value={agent.rule.priority} />
        <Row label="Enabled" value={agent.rule.enabled ? "Yes" : "No"} />
        <Row label="Auto-execute" value={agent.rule.autoExecute ? "Yes" : "No"} />
        <Row label="Approval required" value={agent.rule.approvalRequired ? "Yes" : "No"} />
      </Stack>

      <Divider sx={{ my: 2 }} />
      <Typography variant="overline" color="text.secondary">
        Current Task
      </Typography>
      {agent.latestAction ? (
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Row label="Action" value={agent.latestAction.action.replace(/_/g, " ")} />
          <Row label="Status" value={agent.latestAction.status} />
          <Row label="Proposed" value={formatDateTime(agent.latestAction.createdAt)} />
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          No task proposed yet.
        </Typography>
      )}

      {agent.latestExecution ? (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="overline" color="text.secondary">
            Last Execution
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Row label="Status" value={agent.latestExecution.status} />
            <Row label="Duration" value={formatDuration(agent.latestExecution.durationMs)} />
            <Row label="Dry run" value={agent.latestExecution.dryRun ? "Yes" : "No"} />
            {agent.latestExecution.error ? <Row label="Error" value={agent.latestExecution.error} /> : null}
          </Stack>
        </>
      ) : null}
    </Box>
  );
}

function TaskDetail({ task, onClose }: { task: AttentionItem; onClose: () => void }) {
  const color = severityColors[task.tier];
  return (
    <Box>
      <DrawerHeader title={task.title} onClose={onClose} />
      <Chip label={task.tier} sx={{ backgroundColor: `${color}1f`, color, fontWeight: 600, mb: 2 }} />
      <Stack spacing={1.5}>
        <Row label="Kind" value={task.kind.replace(/_/g, " ")} />
        <Row label="Project" value={task.projectName ?? "–"} />
        <Row label="Created" value={task.createdAt ? formatDateTime(task.createdAt) : "–"} />
        {task.priorityScore !== null ? <Row label="Priority score" value={task.priorityScore} /> : null}
      </Stack>
      <Divider sx={{ my: 2 }} />
      <Typography variant="overline" color="text.secondary">
        Reason
      </Typography>
      <Typography variant="body2" sx={{ mt: 1 }}>
        {task.reason}
      </Typography>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mt: 2 }}>
        Recommended Action
      </Typography>
      <Typography variant="body2" sx={{ mt: 1 }}>
        {task.recommendedAction}
      </Typography>
    </Box>
  );
}
