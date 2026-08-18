import { useState } from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { PageContainer } from "../components/layout/PageContainer";
import { ActiveMaintenanceBanner } from "../components/maintenance/ActiveMaintenanceBanner";
import { ClusterOverviewTab } from "../components/cluster/ClusterOverviewTab";
import { ClusterAgentsTab } from "../components/cluster/ClusterAgentsTab";
import { ClusterFailoverTab } from "../components/cluster/ClusterFailoverTab";
import { ClusterRollingUpdatesTab } from "../components/cluster/ClusterRollingUpdatesTab";

const TABS = ["overview", "agents", "failover", "rolling-updates"] as const;
type ClusterTab = (typeof TABS)[number];

const TAB_LABELS: Record<ClusterTab, string> = {
  overview: "Overview",
  agents: "Agents",
  failover: "Failover",
  "rolling-updates": "Rolling Updates",
};

// Phase 14 "Enterprise Multi-Node Cluster, Remote Agents & High
// Availability" - eine Seite, vier In-Page-Tabs (analog zu
// AutomationCenter.tsx, Phase 11: ein zusammenhaengendes Werkzeug statt
// echter Unterrouten). Teil 10 "Cluster Maintenance" ist bewusst keine
// eigene Tab - ein pausierter Agent (Maintenance Mode) ist bereits im
// Agents-Tab (Chip "PAUSED") und in der Mini City (Observability District)
// sichtbar, siehe Auftrag "sichtbar in Dashboard, Cluster, Analytics, Mini
// City" - keine weitere Parallelanzeige noetig.
export function ClusterCenter() {
  const [tab, setTab] = useState<ClusterTab>("overview");

  return (
    <PageContainer title="Cluster">
      <ActiveMaintenanceBanner />
      <Tabs value={tab} onChange={(_event, value: ClusterTab) => setTab(value)} sx={{ mb: 3 }}>
        {TABS.map((value) => (
          <Tab key={value} value={value} label={TAB_LABELS[value]} />
        ))}
      </Tabs>

      {tab === "overview" && <ClusterOverviewTab />}
      {tab === "agents" && <ClusterAgentsTab />}
      {tab === "failover" && <ClusterFailoverTab />}
      {tab === "rolling-updates" && <ClusterRollingUpdatesTab />}
    </PageContainer>
  );
}
