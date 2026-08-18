import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { keyframes } from "@emotion/react";
import type { RealtimeConnectionStatus } from "../../types/realtime.types";

interface RealtimeStatusProps {
  status: RealtimeConnectionStatus;
}

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

// 🟢 Connected / 🟡 Reconnecting / 🔴 Offline - "connecting" (erster
// Verbindungsaufbau) teilt sich die gelbe Darstellung mit "reconnecting", da
// beide fuer den Nutzer denselben Zustand bedeuten ("noch nicht verbunden").
const STATUS_META: Record<RealtimeConnectionStatus, { label: string; color: string }> = {
  connecting: { label: "Connecting", color: "#f59e0b" },
  connected: { label: "Connected", color: "#22c55e" },
  reconnecting: { label: "Reconnecting", color: "#f59e0b" },
  offline: { label: "Offline", color: "#ef4444" },
};

export function RealtimeStatus({ status }: RealtimeStatusProps) {
  const meta = STATUS_META[status];

  return (
    <Tooltip title={`Realtime: ${meta.label}`}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Box
          component="span"
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: meta.color,
            animation: status !== "offline" ? `${pulse} 2s ease-in-out infinite` : "none",
          }}
        />
        <Typography variant="caption" color="text.secondary" data-testid="realtime-status-label">
          {meta.label}
        </Typography>
      </Box>
    </Tooltip>
  );
}
