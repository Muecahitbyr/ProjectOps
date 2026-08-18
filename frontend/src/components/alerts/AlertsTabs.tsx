import { useNavigate, useLocation } from "react-router-dom";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

const TABS = [
  { value: "/alerts", label: "Rules" },
  { value: "/alerts/create", label: "Create" },
  { value: "/alerts/history", label: "History" },
];

// Gemeinsame Tab-Navigation fuer die drei Alert-Routen (/alerts,
// /alerts/create, /alerts/history) - analog zu AnalyticsTabs.tsx.
export function AlertsTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const current = TABS.find((tab) => tab.value === location.pathname)?.value ?? "/alerts";

  return (
    <Tabs value={current} onChange={(_event, value: string) => navigate(value)} sx={{ mb: 3 }}>
      {TABS.map((tab) => (
        <Tab key={tab.value} value={tab.value} label={tab.label} />
      ))}
    </Tabs>
  );
}
