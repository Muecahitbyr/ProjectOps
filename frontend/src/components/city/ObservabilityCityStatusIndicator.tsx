import { keyframes } from "@emotion/react";
import Box from "@mui/material/Box";
import type { ObservabilityBuildingStatus } from "../../types/observability-city.types";

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.15; }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

export const OBSERVABILITY_STATUS_COLORS: Record<ObservabilityBuildingStatus, string> = {
  idle: "#64748b",
  active: "#3b82f6",
  alert: "#ef4444",
  healthy: "#22c55e",
};

export const OBSERVABILITY_STATUS_LABELS: Record<ObservabilityBuildingStatus, string> = {
  idle: "Idle",
  active: "Active",
  alert: "Needs attention",
  healthy: "Healthy",
};

// Teil 12 "Mini City Erweiterung" - "Animation abhaengig vom Status":
// active dreht sich (Agent-Heartbeat/Backup laeuft/Restore laeuft/
// Prediction rechnet), alert blinkt scharf (Status-Page zeigt einen
// Vorfall), healthy pulsiert langsam, idle steht still - analog zu
// AutomationCityStatusIndicator.tsx.
export function ObservabilityCityStatusIndicator({ status, size = 10 }: { status: ObservabilityBuildingStatus; size?: number }) {
  const color = OBSERVABILITY_STATUS_COLORS[status];

  if (status === "active") {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `2px solid ${color}`,
          borderTopColor: "transparent",
          animation: `${spin} 900ms linear infinite`,
        }}
      />
    );
  }

  if (status === "idle") {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: color,
          opacity: 0.5,
        }}
      />
    );
  }

  const animation = status === "alert" ? blink : pulse;
  const durationMs = status === "alert" ? 650 : 2400;

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        boxShadow: `0 0 6px 2px ${color}`,
        animation: `${animation} ${durationMs}ms ease-in-out infinite`,
      }}
    />
  );
}
