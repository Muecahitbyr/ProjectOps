import { memo } from "react";
import type { ReactElement } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import ChangeCircleOutlinedIcon from "@mui/icons-material/ChangeCircleOutlined";
import FindInPageOutlinedIcon from "@mui/icons-material/FindInPageOutlined";
import PolicyOutlinedIcon from "@mui/icons-material/PolicyOutlined";
import { EmptyState } from "../common/EmptyState";
import { AgentCard } from "./AgentCard";
import { TaskCard } from "./TaskCard";
import { severityColors } from "../../theme/statusColors";
import type { DepartmentConfig, AgentSnapshot, DepartmentId } from "./officeConfig";
import type { AttentionItem, AttentionTier } from "../../types/attention.types";

interface DepartmentBoardProps {
  department: DepartmentConfig;
  agents: AgentSnapshot[];
  tasks: AttentionItem[];
  onSelectAgent: (agent: AgentSnapshot) => void;
  onSelectTask: (task: AttentionItem) => void;
}

// Ein Icon je Abteilung fuer schnelle raeumliche Wiedererkennung ("das ist
// der Incident-Response-Bereich") - reine Praesentation, lebt bewusst hier
// (statt in officeConfig.ts, das JSX-frei bleibt).
const DEPARTMENT_ICON: Record<DepartmentId, ReactElement> = {
  "incident-response": <ReportProblemOutlinedIcon fontSize="small" />,
  "reliability-risk": <ShieldOutlinedIcon fontSize="small" />,
  "change-management": <ChangeCircleOutlinedIcon fontSize="small" />,
  "problem-management": <FindInPageOutlinedIcon fontSize="small" />,
  "automation-governance": <PolicyOutlinedIcon fontSize="small" />,
};

const TIER_RANK: Record<AttentionTier, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

function worstTier(tasks: AttentionItem[]): AttentionTier | null {
  if (tasks.length === 0) return null;
  return tasks.reduce<AttentionTier>((worst, t) => (TIER_RANK[t.tier] > TIER_RANK[worst] ? t.tier : worst), tasks[0]!.tier);
}

// Eine "Abteilung" = ein Kartenbereich mit den beiden bereits vorhandenen
// Datenquellen nebeneinander: der echten Automation-Rule-Belegschaft (siehe
// officeConfig.ts#departmentForRule) und der echten Attention-List-
// Aufgabenliste (Phase 64) fuer dieselbe Kategorie. Beide Listen koennen
// unabhaengig leer sein - saubere Empty States statt erfundener Platzhalter.
//
// Phase 2 "Polish" - memo()isiert: agents/tasks-Arrays sind in der
// Elternkomponente bereits per useMemo stabil, onSelect* per useCallback -
// verhindert unnoetige Re-Renders der uebrigen vier Abteilungen, wenn nur
// eine einzelne Abteilung neue Daten bekommt.
export const DepartmentBoard = memo(function DepartmentBoard({ department, agents, tasks, onSelectAgent, onSelectTask }: DepartmentBoardProps) {
  const tier = worstTier(tasks);
  const workingCount = agents.filter((a) => a.status === "WORKING").length;

  return (
    <Card variant="outlined" sx={{ height: "100%", borderTopWidth: 3, borderTopColor: department.accentColor }}>
      <CardContent>
        <Stack direction="row" sx={{ mb: 0.5, alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box sx={{ color: department.accentColor, display: "flex" }}>{DEPARTMENT_ICON[department.id]}</Box>
            <Typography variant="h4">{department.name}</Typography>
          </Stack>
          {tier ? (
            <Chip size="small" label={`${tasks.length} open`} sx={{ backgroundColor: `${severityColors[tier]}1f`, color: severityColors[tier], fontWeight: 600 }} />
          ) : (
            <Chip size="small" label="Clear" sx={{ backgroundColor: "action.hover", fontWeight: 600 }} />
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {department.description}
        </Typography>

        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="overline" color="text.secondary">
            AI Agents ({agents.length})
          </Typography>
          {workingCount > 0 ? (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: "#3b82f6",
                  animation: "office-board-pulse 1.4s ease-in-out infinite",
                  "@keyframes office-board-pulse": {
                    "0%": { opacity: 1 },
                    "50%": { opacity: 0.3 },
                    "100%": { opacity: 1 },
                  },
                }}
              />
              <Typography variant="caption" sx={{ color: "#3b82f6", fontWeight: 600 }}>
                {workingCount} working now
              </Typography>
            </Stack>
          ) : null}
        </Stack>
        <Stack spacing={1} sx={{ mt: 1, mb: 2 }}>
          {agents.length === 0 ? (
            <EmptyState message="No AI agents assigned to this department yet." minHeight={64} />
          ) : (
            agents.map((agent) => <AgentCard key={agent.rule.id} agent={agent} onSelect={onSelectAgent} />)
          )}
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Typography variant="overline" color="text.secondary">
          Task Queue ({tasks.length})
        </Typography>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {tasks.length === 0 ? (
            <Box sx={{ py: 1 }}>
              <EmptyState message="No open tasks for this department." minHeight={64} />
            </Box>
          ) : (
            tasks.slice(0, 6).map((task, index) => (
              <TaskCard key={`${task.kind}-${task.entityId}-${task.projectId}-${task.title}`} task={task} onSelect={onSelectTask} animationDelayMs={index * 40} />
            ))
          )}
        </Stack>
        {tasks.length > 6 ? (
          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
            +{tasks.length - 6} more
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
});
