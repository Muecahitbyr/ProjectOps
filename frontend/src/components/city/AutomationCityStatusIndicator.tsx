import { keyframes } from "@emotion/react";
import Box from "@mui/material/Box";
import type { AutomationBuildingStatus } from "../../types/automation-city.types";

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

export const AUTOMATION_STATUS_COLORS: Record<AutomationBuildingStatus, string> = {
  idle: "#64748b",
  running: "#3b82f6",
  waiting_approval: "#f59e0b",
  failed: "#ef4444",
  healthy: "#22c55e",
};

export const AUTOMATION_STATUS_LABELS: Record<AutomationBuildingStatus, string> = {
  idle: "Idle",
  running: "Running",
  waiting_approval: "Waiting approval",
  failed: "Failed",
  healthy: "Healthy",
};

// Teil 8 "Mini City": "Animation abhaengig vom Status" - running dreht sich
// (aktive Arbeit), waiting_approval blinkt gemaechlich (braucht
// Aufmerksamkeit), failed blinkt scharf (dringend), healthy pulsiert
// langsam, idle steht still.
export function AutomationCityStatusIndicator({ status, size = 10 }: { status: AutomationBuildingStatus; size?: number }) {
  const color = AUTOMATION_STATUS_COLORS[status];

  if (status === "running") {
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

  const animation = status === "failed" ? blink : pulse;
  const durationMs = status === "failed" ? 650 : status === "waiting_approval" ? 1400 : 2400;

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
