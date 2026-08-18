import { keyframes } from "@emotion/react";
import Box from "@mui/material/Box";
import type { HealthStatus } from "../../types/common.types";
import { healthStatusColors } from "../../theme/statusColors";

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.15; }
`;

// Healthy pulsiert langsam, Warning etwas schneller (beides "Puls"),
// Critical blinkt scharf - macht Dringlichkeit spuerbar, ohne aufdringlich
// zu sein (kein Performance-Problem: reine CSS-Keyframes, keine JS-Timer).
const ANIMATION_DURATION_MS: Record<HealthStatus, number> = {
  healthy: 2400,
  warning: 1200,
  critical: 650,
};

interface CityStatusIndicatorProps {
  status: HealthStatus;
  size?: number;
}

export function CityStatusIndicator({ status, size = 10 }: CityStatusIndicatorProps) {
  const color = healthStatusColors[status];
  const animation = status === "critical" ? blink : pulse;

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        boxShadow: `0 0 6px 2px ${color}`,
        animation: `${animation} ${ANIMATION_DURATION_MS[status]}ms ease-in-out infinite`,
      }}
    />
  );
}
