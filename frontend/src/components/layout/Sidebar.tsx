import { NavLink } from "react-router-dom";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { AccountMenu } from "./AccountMenu";

export const SIDEBAR_WIDTH = 232;

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

// Auf Nutzerwunsch radikal reduziert: nur noch das KI-Buero + Settings.
// Alle uebrigen, in frueheren Phasen gebauten Nav-Eintraege (Dashboard,
// Projects, Incidents, Analytics, SLA Reports, Platform-Admin-Bereiche, ...)
// wurden entfernt - der Code der jeweiligen Seiten bleibt erhalten (siehe
// Git-Historie), ist aber bewusst nicht mehr verlinkt/geroutet (siehe App.tsx).
const navItems: NavItem[] = [{ label: "KI-Büro", to: "/ai-office", icon: <AutoAwesomeOutlinedIcon fontSize="small" /> }];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// Responsive: auf "md" und groesser weiterhin die feste, immer sichtbare
// Sidebar wie zuvor (variant="permanent"); auf Handy-Breiten stattdessen
// eine per Hamburger-Icon (Header) ein-/ausklappbare Overlay-Drawer
// (variant="temporary"), die keinen festen Platz vom Content abzieht - sonst
// bliebe auf einem 320-390px breiten Handy fuer die eigentliche Seite (z.B.
// das KI-Buero) nur ein schmaler Streifen uebrig.
export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const items = [...navItems, { label: "Settings", to: "/settings", icon: <SettingsOutlinedIcon fontSize="small" /> }];

  const navList = (
    <List sx={{ px: 1.5 }}>
      {items.map((item) => (
        <ListItemButton
          key={item.to}
          component={NavLink}
          to={item.to}
          end={item.to === "/"}
          onClick={onMobileClose}
          sx={{
            borderRadius: 2,
            mb: 0.5,
            "&.active": {
              backgroundColor: "rgba(59, 130, 246, 0.14)",
              color: "primary.main",
              "& .MuiListItemIcon-root": { color: "primary.main" },
            },
          }}
        >
          <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
          <ListItemText slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 500 } } }}>
            {item.label}
          </ListItemText>
        </ListItemButton>
      ))}
    </List>
  );

  const header = (
    <Box sx={{ px: 2.5, py: 2.5 }}>
      <Typography variant="h4" sx={{ letterSpacing: "0.02em" }}>
        ProjectOps
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Monitoring Platform
      </Typography>
    </Box>
  );

  return (
    <Box component="nav" sx={{ width: { md: SIDEBAR_WIDTH }, flexShrink: { md: 0 } }}>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          [`& .MuiDrawer-paper`]: { width: SIDEBAR_WIDTH, boxSizing: "border-box" },
        }}
      >
        {header}
        <AccountMenu />
        <Divider sx={{ mb: 1 }} />
        {navList}
      </Drawer>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: SIDEBAR_WIDTH, boxSizing: "border-box" },
        }}
      >
        {header}
        <AccountMenu />
        <Divider sx={{ mb: 1 }} />
        {navList}
      </Drawer>
    </Box>
  );
}
