import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import { useDashboardSummary } from "../../hooks/useDashboard";
import { StatusBadge } from "../common/StatusBadge";
import { RealtimeStatus } from "../realtime/RealtimeStatus";
import { formatRelativeTime } from "../../utils/formatters";
import { SIDEBAR_WIDTH } from "./Sidebar";
import type { RealtimeConnectionStatus } from "../../types/realtime.types";

interface HeaderProps {
  title: string;
  realtimeStatus: RealtimeConnectionStatus;
}

// Zeigt zusaetzlich zum Seitentitel den globalen System-Status an - nutzt
// dieselbe React-Query-Query wie die Dashboard-Seite (dedupliziert, kein
// zusaetzlicher Request).
export function Header({ title, realtimeStatus }: HeaderProps) {
  const { data } = useDashboardSummary();

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{ width: `calc(100% - ${SIDEBAR_WIDTH}px)`, ml: `${SIDEBAR_WIDTH}px` }}
    >
      <Toolbar sx={{ justifyContent: "space-between", minHeight: 64 }}>
        <Typography variant="h3">{title}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <RealtimeStatus status={realtimeStatus} />
          {data ? (
            <>
              <Divider orientation="vertical" flexItem sx={{ my: 1 }} />
              <Typography variant="caption" color="text.secondary">
                Updated {formatRelativeTime(data.generatedAt)}
              </Typography>
              <StatusBadge status={data.status} />
            </>
          ) : null}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
