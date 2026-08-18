import { memo } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import ButtonBase from "@mui/material/ButtonBase";
import Tooltip from "@mui/material/Tooltip";
import { severityColors } from "../../theme/statusColors";
import { formatRelativeTime } from "../../utils/formatters";
import type { AttentionItem } from "../../types/attention.types";

interface TaskCardProps {
  task: AttentionItem;
  onSelect: (task: AttentionItem) => void;
  // Staffelt die Eintritts-Animation je Position in der Liste (0, 40ms,
  // 80ms, ...) fuer ein "die Aufgaben treffen nacheinander ein"-Gefuehl -
  // rein CSS, feuert dank stabilem key nur beim tatsaechlichen Neu-Mount
  // eines Eintrags (echte neue Aufgabe), nicht bei jedem Re-Render.
  animationDelayMs?: number;
}

// Eine Ticket-Karte je echtem Attention-List-Eintrag (Phase 64) - Titel/
// Tier/Grund/Alter stammen 1:1 aus der bereits vom Backend priorisierten
// Liste, keine eigene Neubewertung im Frontend.
export const TaskCard = memo(function TaskCard({ task, onSelect, animationDelayMs = 0 }: TaskCardProps) {
  const color = severityColors[task.tier];
  return (
    <ButtonBase
      onClick={() => onSelect(task)}
      sx={{
        display: "block",
        width: "100%",
        textAlign: "left",
        borderRadius: 1.5,
        px: 1.5,
        py: 1,
        border: "1px solid",
        borderColor: "divider",
        borderLeftWidth: 3,
        borderLeftColor: color,
        opacity: 0,
        animation: `office-task-in 0.35s ease-out ${animationDelayMs}ms forwards`,
        "@keyframes office-task-in": {
          from: { opacity: 0, transform: "translateY(4px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        "&:hover": { backgroundColor: "action.hover" },
      }}
    >
      <Stack spacing={0.25} sx={{ width: "100%" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Tooltip title={task.reason} enterDelay={400}>
            <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: 600 }}>
              {task.title}
            </Typography>
          </Tooltip>
          <Chip size="small" label={task.tier} sx={{ backgroundColor: `${color}1f`, color, fontWeight: 600, height: 20, fontSize: "0.7rem" }} />
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {task.reason}
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="caption" color="text.disabled">
            {task.projectName ?? "Unscoped"}
          </Typography>
          <Typography variant="caption" color="text.disabled">
            {task.createdAt ? formatRelativeTime(task.createdAt) : ""}
          </Typography>
        </Box>
      </Stack>
    </ButtonBase>
  );
});
