import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import type { HealthStatus } from "../../types/common.types";
import { healthStatusColors, healthStatusLabels } from "../../theme/statusColors";

interface StatusBadgeProps {
  status: HealthStatus;
  size?: "small" | "medium";
}

// Kleiner, wiederverwendbarer Status-Indikator: farbiger Punkt + Chip-Label.
// Wird ueberall verwendet, wo ein HealthStatus dargestellt wird (Dashboard,
// Projektkarten, Projekt-Detail).
export function StatusBadge({ status, size = "small" }: StatusBadgeProps) {
  const color = healthStatusColors[status];

  return (
    <Chip
      size={size}
      label={healthStatusLabels[status]}
      icon={
        <Box
          component="span"
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: color,
            ml: "8px !important",
          }}
        />
      }
      sx={{
        backgroundColor: `${color}1f`,
        color,
        border: `1px solid ${color}40`,
        "& .MuiChip-icon": { color },
      }}
    />
  );
}
