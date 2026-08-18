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

export function Sidebar() {
  const items = [...navItems, { label: "Settings", to: "/settings", icon: <SettingsOutlinedIcon fontSize="small" /> }];
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { width: SIDEBAR_WIDTH, boxSizing: "border-box" },
      }}
    >
      <Box sx={{ px: 2.5, py: 2.5 }}>
        <Typography variant="h4" sx={{ letterSpacing: "0.02em" }}>
          ProjectOps
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Monitoring Platform
        </Typography>
      </Box>
      <AccountMenu />
      <Divider sx={{ mb: 1 }} />
      <List sx={{ px: 1.5 }}>
        {items.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            end={item.to === "/"}
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
    </Drawer>
  );
}
