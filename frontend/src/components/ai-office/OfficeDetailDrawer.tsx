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
import type { OfficeAgentWithProjectType } from "./OfficeFloorScene";
import { severityColors } from "../../theme/statusColors";
import { formatDateTime, formatDuration } from "../../utils/formatters";
import type { AttentionItem } from "../../types/attention.types";

export type OfficeSelection = { type: "agent"; agent: OfficeAgentWithProjectType } | { type: "task"; task: AttentionItem } | null;

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

// Ein Block pro echter Automation Rule - bei einem Schreibtisch, der mehrere
// Regeln zusammenfasst ("2 in einem", z.B. Rechno/bayar-solutions.de), wird
// diese Funktion mehrfach gerendert, damit keine der echten Regeln beim
// Zusammenfassen verschwindet. Bei genau einer Regel (isOnly) sieht das
// Ergebnis exakt wie vorher aus (keine zusaetzliche Ueberschrift/Rahmen).
function RuleBlock({ ruleSnapshot, isOnly }: { ruleSnapshot: AgentSnapshot; isOnly: boolean }) {
  const color = AGENT_STATUS_COLOR[ruleSnapshot.status];
  return (
    <Box sx={isOnly ? undefined : { p: 1.5, borderRadius: 2, border: "1px solid rgba(0,0,0,0.09)" }}>
      {!isOnly ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5, flexWrap: "wrap" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {ruleSnapshot.rule.name}
          </Typography>
          <Chip label={AGENT_STATUS_LABEL[ruleSnapshot.status]} size="small" sx={{ backgroundColor: `${color}1f`, color, fontWeight: 600 }} />
        </Stack>
      ) : null}
      <Stack spacing={1.5}>
        <Row label="Role" value={ruleSnapshot.rule.action.replace(/_/g, " ")} />
        <Row label="Trigger" value={ruleSnapshot.rule.trigger.replace(/_/g, " ")} />
        <Row label="Priority" value={ruleSnapshot.rule.priority} />
        <Row label="Enabled" value={ruleSnapshot.rule.enabled ? "Yes" : "No"} />
        <Row label="Auto-execute" value={ruleSnapshot.rule.autoExecute ? "Yes" : "No"} />
        <Row label="Approval required" value={ruleSnapshot.rule.approvalRequired ? "Yes" : "No"} />
      </Stack>

      <Divider sx={{ my: 2 }} />
      <Typography variant="overline" color="text.secondary">
        Current Task
      </Typography>
      {ruleSnapshot.latestAction ? (
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Row label="Action" value={ruleSnapshot.latestAction.action.replace(/_/g, " ")} />
          <Row label="Status" value={ruleSnapshot.latestAction.status} />
          <Row label="Proposed" value={formatDateTime(ruleSnapshot.latestAction.createdAt)} />
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          No task proposed yet.
        </Typography>
      )}

      {ruleSnapshot.latestExecution ? (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="overline" color="text.secondary">
            Last Execution
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Row label="Status" value={ruleSnapshot.latestExecution.status} />
            <Row label="Duration" value={formatDuration(ruleSnapshot.latestExecution.durationMs)} />
            <Row label="Dry run" value={ruleSnapshot.latestExecution.dryRun ? "Yes" : "No"} />
            {ruleSnapshot.latestExecution.error ? <Row label="Error" value={ruleSnapshot.latestExecution.error} /> : null}
          </Stack>
        </>
      ) : null}
    </Box>
  );
}

function AgentDetail({ agent, onClose }: { agent: OfficeAgentWithProjectType; onClose: () => void }) {
  const color = AGENT_STATUS_COLOR[agent.status];
  const isBlocked = agent.status === "BLOCKED";
  const isProjectBroken = Boolean(agent.projectHealth?.critical) || agent.openIncidents.length > 0;
  const isGrouped = agent.groupedRules.length > 1;
  return (
    <Box>
      {/* Bei zusammengefassten Schreibtischen ("2 in einem") ist der Titel
          der echte Projektname statt des Namens nur einer der mehreren
          Regeln - sonst wuerde eine Regel die andere(n) im Titel verdecken. */}
      <DrawerHeader title={agent.projectName} onClose={onClose} />
      <Chip label={AGENT_STATUS_LABEL[agent.status]} sx={{ backgroundColor: `${color}1f`, color, fontWeight: 600, mb: 2 }} />

      {/* Der konkrete Grund, warum der Schreibtisch brennt (BLOCKED-Status
          und/oder echte offene Incidents) - direkt oben, bevor die
          restlichen technischen Details der Automation-Regel(n). */}
      {isBlocked || isProjectBroken ? (
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, backgroundColor: "#fdeceA", border: "1px solid #f3b8a8" }}>
          <Typography variant="overline" sx={{ color: "#c0392b", fontWeight: 800, letterSpacing: "0.05em" }}>
            🚨 Warum ist der Alarm aktiv?
          </Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {isBlocked ? (
              <Typography variant="body2" sx={{ color: "#7a2e1f" }}>
                Eine Automation-Regel selbst ist blockiert:{" "}
                <strong>{agent.latestExecution?.error ?? "Letzte Ausführung fehlgeschlagen"}</strong>
              </Typography>
            ) : null}
            {agent.openIncidents.length > 0 ? (
              <Box>
                <Typography variant="body2" sx={{ color: "#7a2e1f", mb: 0.5 }}>
                  {agent.openIncidents.length} offene{agent.openIncidents.length === 1 ? "r" : ""} Incident
                  {agent.openIncidents.length === 1 ? "" : "s"} im Projekt <strong>{agent.projectName}</strong>:
                </Typography>
                <Stack spacing={0.5}>
                  {agent.openIncidents.map((incident) => (
                    <Stack key={incident.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Chip
                        label={incident.severity}
                        size="small"
                        sx={{ backgroundColor: `${severityColors[incident.severity]}1f`, color: severityColors[incident.severity], fontWeight: 700, height: 18, fontSize: "0.62rem" }}
                      />
                      <Typography variant="body2" sx={{ color: "#4a2e26" }}>
                        {incident.title}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            ) : agent.projectHealth?.critical ? (
              <Typography variant="body2" sx={{ color: "#7a2e1f" }}>
                Projekt-Health-Status ist kritisch (kein einzelner offener Incident, aber Checks schlagen fehl).
              </Typography>
            ) : null}
          </Stack>
        </Box>
      ) : null}

      <Row label="Project" value={agent.projectName} />

      {/* Bei mehreren zusammengefassten Regeln: jede Regel bekommt ihren
          eigenen Block (Name + Status + volle Details), statt nur eine
          davon zu zeigen - "2 in einem" heisst beide sichtbar, nicht eine
          versteckt. */}
      {isGrouped ? (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="overline" color="text.secondary">
            {agent.groupedRules.length} Automation Rules
          </Typography>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {agent.groupedRules.map((ruleSnapshot) => (
              <RuleBlock key={ruleSnapshot.rule.id} ruleSnapshot={ruleSnapshot} isOnly={false} />
            ))}
          </Stack>
        </>
      ) : (
        <Box sx={{ mt: 2 }}>
          <RuleBlock ruleSnapshot={agent.groupedRules[0] ?? agent} isOnly={true} />
        </Box>
      )}
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
