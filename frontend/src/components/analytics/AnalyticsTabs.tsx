import { useNavigate, useLocation } from "react-router-dom";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

const TABS = [
  { value: "/analytics", label: "Overview" },
  { value: "/analytics/incidents", label: "Incidents" },
  { value: "/analytics/compare", label: "Compare" },
];

// Gemeinsame Tab-Navigation fuer alle drei Analytics-Routen (/analytics,
// /analytics/incidents, /analytics/compare) - jede Seite bleibt eine echte,
// eigenstaendige Route (siehe App.tsx), die Tabs sind nur eine Navigations-
// Abkuerzung zwischen ihnen.
export function AnalyticsTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const current = TABS.find((tab) => tab.value === location.pathname)?.value ?? "/analytics";

  return (
    <Tabs value={current} onChange={(_event, value: string) => navigate(value)} sx={{ mb: 3 }}>
      {TABS.map((tab) => (
        <Tab key={tab.value} value={tab.value} label={tab.label} />
      ))}
    </Tabs>
  );
}
