import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import { useDashboardSummary } from "../../hooks/useDashboard";
import { StatusBadge } from "../common/StatusBadge";
import { RealtimeStatus } from "../realtime/RealtimeStatus";
import { formatRelativeTime } from "../../utils/formatters";
import { SIDEBAR_WIDTH } from "./Sidebar";
import type { RealtimeConnectionStatus } from "../../types/realtime.types";

interface HeaderProps {
  title: string;
  realtimeStatus: RealtimeConnectionStatus;
  onMenuClick: () => void;
}

// Zeigt zusaetzlich zum Seitentitel den globalen System-Status an - nutzt
// dieselbe React-Query-Query wie die Dashboard-Seite (dedupliziert, kein
// zusaetzlicher Request).
export function Header({ title, realtimeStatus, onMenuClick }: HeaderProps) {
  const { data } = useDashboardSummary();

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{ width: { md: `calc(100% - ${SIDEBAR_WIDTH}px)` }, ml: { md: `${SIDEBAR_WIDTH}px` } }}
    >
      <Toolbar sx={{ justifyContent: "space-between", minHeight: 64, gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
          {/* Hamburger-Icon nur auf Handy-Breiten - oeffnet die
              Overlay-Sidebar (siehe Sidebar.tsx), auf "md"+ bleibt die
              Sidebar dauerhaft sichtbar, daher hier ausgeblendet. */}
          <IconButton onClick={onMenuClick} edge="start" aria-label="Menü öffnen" sx={{ display: { xs: "inline-flex", md: "none" }, mr: 0.5 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h3" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <RealtimeStatus status={realtimeStatus} />
          {data ? (
            <>
              <Divider orientation="vertical" flexItem sx={{ my: 1, display: { xs: "none", sm: "block" } }} />
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", sm: "block" } }}>
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
