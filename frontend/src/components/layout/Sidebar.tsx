import { NavLink } from "react-router-dom";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import LocationCityOutlinedIcon from "@mui/icons-material/LocationCityOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import QueryStatsOutlinedIcon from "@mui/icons-material/QueryStatsOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import BackupOutlinedIcon from "@mui/icons-material/BackupOutlined";
import MonitorHeartOutlinedIcon from "@mui/icons-material/MonitorHeartOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import PhoneInTalkOutlinedIcon from "@mui/icons-material/PhoneInTalkOutlined";
import ChangeCircleOutlinedIcon from "@mui/icons-material/ChangeCircleOutlined";
import SummarizeOutlinedIcon from "@mui/icons-material/SummarizeOutlined";
import AutoGraphOutlinedIcon from "@mui/icons-material/AutoGraphOutlined";
import FindInPageOutlinedIcon from "@mui/icons-material/FindInPageOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { AccountMenu } from "./AccountMenu";
import { useAuth } from "../../auth/AuthContext";

export const SIDEBAR_WIDTH = 232;

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: "Dashboard", to: "/", icon: <SpaceDashboardOutlinedIcon fontSize="small" /> },
  { label: "Projects", to: "/projects", icon: <AppsOutlinedIcon fontSize="small" /> },
  { label: "Incidents", to: "/incidents", icon: <ReportProblemOutlinedIcon fontSize="small" /> },
  // Phase 26 "Enterprise Incident Postmortems & Retrospectives" - bewusst
  // NICHT admin-only: die Backend-Routen nutzen (wie alle uebrigen
  // /incidents-Routen) nur "authenticate", kein authorizePlatformOwner().
  { label: "Postmortems", to: "/postmortems", icon: <SummarizeOutlinedIcon fontSize="small" /> },
  { label: "Analytics", to: "/analytics", icon: <QueryStatsOutlinedIcon fontSize="small" /> },
  { label: "SLA Reports", to: "/sla-reports", icon: <AssessmentOutlinedIcon fontSize="small" /> },
  { label: "Alerts", to: "/alerts", icon: <NotificationsActiveOutlinedIcon fontSize="small" /> },
  // Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" - anders
  // als die uebrigen /platform/*-Seiten unten bewusst NICHT admin-only:
  // On-Call-Schedules sind backend-seitig ueber authorizePlatformOr
  // OrganizationMembership() erreichbar (echte Mitgliedschaft in der
  // JEWEILIGEN Organisation genuegt, siehe middleware/authorize.ts) - kein
  // Global-Admin/Platform-Owner noetig. Ein regulaerer ORGANIZATION_OWNER
  // (z.B. der Phase-24-Testaccount) muss die Seite in der Navigation sehen
  // koennen, sonst waere das Feature fuer die meisten legitimen Nutzer
  // faktisch unerreichbar - live im eigenen Browser-Test gefunden (die Seite
  // war fuer diesen Account per API voll nutzbar, aber nicht verlinkt).
  { label: "On-Call", to: "/platform/on-call", icon: <PhoneInTalkOutlinedIcon fontSize="small" /> },
  // Phase 28 "Enterprise Maintenance Windows, Change Management &
  // Deployment Risk" - dieselbe Sichtbarkeitsregel wie On-Call oben:
  // /changes ist backend-seitig ueber authorizePlatformOrOrganization
  // Membership() erreichbar (echte Organisationsmitgliedschaft genuegt),
  // daher bewusst NICHT in adminOnlyNavItems.
  { label: "Changes", to: "/changes", icon: <ChangeCircleOutlinedIcon fontSize="small" /> },
  // Phase 33 "Enterprise Reliability Intelligence & Incident Learning" -
  // dieselbe Sichtbarkeitsregel wie On-Call/Changes oben: /api/reliability/*
  // nutzt authorizePlatformOrOrganizationMembership() (echte Organisations-
  // mitgliedschaft genuegt), daher bewusst NICHT in adminOnlyNavItems.
  { label: "Reliability", to: "/reliability", icon: <AutoGraphOutlinedIcon fontSize="small" /> },
  // Phase 35 "Enterprise Problem Management & Root-Cause Intelligence" -
  // dieselbe Sichtbarkeitsregel wie Reliability/Changes/On-Call oben:
  // /api/problems/* nutzt authorizePlatformOrOrganizationMembership() (echte
  // Organisationsmitgliedschaft genuegt), daher bewusst NICHT admin-only.
  { label: "Problems", to: "/problems", icon: <FindInPageOutlinedIcon fontSize="small" /> },
  // Phase 37 "Enterprise Service Resilience & Dependency Intelligence" -
  // dieselbe Sichtbarkeitsregel wie Reliability/Problems oben: /api/resilience/*
  // nutzt authorizePlatformOrOrganizationMembership() (echte Organisations-
  // mitgliedschaft genuegt), daher bewusst NICHT admin-only.
  { label: "Resilience", to: "/resilience", icon: <ShieldOutlinedIcon fontSize="small" /> },
  // AI Operations Office - reine Visualisierung ueber /api/resilience/
  // attention-list und /api/resilience/operational-state, dieselbe
  // Sichtbarkeitsregel wie Resilience oben (echte Organisationsmitgliedschaft
  // genuegt, nicht admin-only).
  { label: "AI Office", to: "/ai-office", icon: <AutoAwesomeOutlinedIcon fontSize="small" /> },
  // Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis" -
  // dieselbe Korrektur wie bei On-Call oben: die Phase-24-Sicherheitskorrektur
  // (authorizePlatformOrOrganizationMembership, siehe middleware/authorize.ts)
  // machte /platform/slo und /platform/services/-topology bereits fuer echte
  // Mitglieder der jeweiligen Organisation nutzbar (nicht nur Global Admins),
  // die Navigation blieb aber admin-only - im Phase-24-Abschlussbericht als
  // bekannte Einschraenkung dokumentiert. Da Phase 25 direkt auf diesen
  // Seiten aufbaut (Impact-/Blast-Radius-Ansicht in ServiceDetail/Topology)
  // und ein regulaerer Organisation-Owner sie erreichen koennen muss, wird
  // die Einschraenkung hier behoben - "Platform Admin"/"API Analytics"/
  // "Developer Portal" bleiben admin-only, da deren Backend (platform.routes.ts)
  // weiterhin ausschliesslich authorizePlatformOwner() nutzt (unveraendert,
  // ausserhalb des Scopes dieser Phase).
  { label: "SLOs", to: "/platform/slo", icon: <TrackChangesOutlinedIcon fontSize="small" /> },
  { label: "Services", to: "/platform/services", icon: <AccountTreeOutlinedIcon fontSize="small" /> },
  { label: "Topology", to: "/platform/topology", icon: <HubOutlinedIcon fontSize="small" /> },
  { label: "Maintenance", to: "/maintenance", icon: <BuildOutlinedIcon fontSize="small" /> },
  { label: "Automation", to: "/automation", icon: <SmartToyOutlinedIcon fontSize="small" /> },
  { label: "Cluster", to: "/cluster", icon: <HubOutlinedIcon fontSize="small" /> },
  { label: "Agent Logs", to: "/agent-logs", icon: <ArticleOutlinedIcon fontSize="small" /> },
  { label: "Users", to: "/users", icon: <PeopleAltOutlinedIcon fontSize="small" /> },
  { label: "City", to: "/city", icon: <LocationCityOutlinedIcon fontSize="small" /> },
];

// Phase 13: Audit Center/Backup Center/Diagnostics Center sind serverseitig
// authorizeGlobalAdmin()-geschuetzt (routes/audit.routes.ts,
// backups.routes.ts, diagnostics.routes.ts) - hier zusaetzlich aus der
// Navigation ausgeblendet, statt Nicht-Admins erst beim Seitenaufruf mit
// einem 403 zu konfrontieren.
const adminOnlyNavItems: NavItem[] = [
  { label: "Audit Center", to: "/audit", icon: <FactCheckOutlinedIcon fontSize="small" /> },
  { label: "Backup Center", to: "/backups", icon: <BackupOutlinedIcon fontSize="small" /> },
  { label: "Diagnostics", to: "/diagnostics", icon: <MonitorHeartOutlinedIcon fontSize="small" /> },
  // Phase 15: Platform Administration ist Platform-Owner-only (mit
  // Fallback auf authorizeGlobalAdmin, siehe middleware/authorize.ts) -
  // dieselbe Sichtbarkeitsregel wie die uebrigen admin-only Seiten oben.
  { label: "Platform Admin", to: "/platform", icon: <AdminPanelSettingsOutlinedIcon fontSize="small" /> },
  // Phase 19 "Enterprise Observability, API Analytics & Operational
  // Intelligence" - eigene Seite (nicht Teil der Platform-Administration-
  // Tabs), aber dieselbe Sichtbarkeitsregel wie "Platform Admin" oben
  // (Backend: authorizePlatformOwner auf /api/platform/api-analytics/*).
  { label: "API Analytics", to: "/platform/api-analytics", icon: <InsightsOutlinedIcon fontSize="small" /> },
  // Phase 20 "Enterprise API Governance, Developer Portal & Credential
  // Lifecycle" - eigene Seite, dieselbe Sichtbarkeitsregel wie die
  // uebrigen Platform-Owner-only Eintraege oben.
  { label: "Developer Portal", to: "/platform/developer", icon: <CodeOutlinedIcon fontSize="small" /> },
];

export function Sidebar() {
  const { isGlobalAdmin } = useAuth();
  const items = [...navItems, ...(isGlobalAdmin ? adminOnlyNavItems : []), { label: "Settings", to: "/settings", icon: <SettingsOutlinedIcon fontSize="small" /> }];
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
