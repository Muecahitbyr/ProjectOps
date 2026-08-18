import { useState } from "react";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { PageContainer } from "../components/layout/PageContainer";
import { StatsCard } from "../components/dashboard/StatsCard";
import { AutomationOverviewTab } from "../components/automation/AutomationOverviewTab";
import { AutomationRulesTab } from "../components/automation/AutomationRulesTab";
import { AutomationExecutionsTab } from "../components/automation/AutomationExecutionsTab";
import { AutomationApprovalsTab } from "../components/automation/AutomationApprovalsTab";
import { AutomationTemplatesTab } from "../components/automation/AutomationTemplatesTab";
import { AutomationHistoryTab } from "../components/automation/AutomationHistoryTab";
import { useAutomationRules } from "../hooks/useAutomationRules";
import { useAutomationActions } from "../hooks/useAutomationActions";
import { useAutomationExecutions } from "../hooks/useAutomationExecutions";
import { useAutomationAnalytics } from "../hooks/useAutomationAnalytics";
import { formatDuration } from "../utils/formatters";
import { healthStatusColors } from "../theme/statusColors";

const TABS = ["overview", "rules", "executions", "approvals", "templates", "history"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  rules: "Rules",
  executions: "Executions",
  approvals: "Approvals",
  templates: "Templates",
  history: "History",
};

// Phase 11 Teil 3 "Automation Dashboard" - eine Seite, sechs In-Page-Tabs
// (kein Routenwechsel noetig, es ist ein zusammenhaengendes Werkzeug, siehe
// Begruendung im Vergleich zu AlertsTabs.tsx, das echte Unterseiten verbindet).
export function AutomationCenter() {
  const [tab, setTab] = useState<Tab>("overview");

  const rulesQuery = useAutomationRules();
  const pendingApprovalsQuery = useAutomationActions(undefined, "PROPOSED");
  const runningExecutionsQuery = useAutomationExecutions({ status: "RUNNING" });
  const analyticsQuery = useAutomationAnalytics();

  const totalRules = rulesQuery.data?.length ?? 0;
  const activeRules = rulesQuery.data?.filter((rule) => rule.enabled).length ?? 0;
  const runningExecutions = runningExecutionsQuery.data?.length ?? 0;
  const pendingApprovals = pendingApprovalsQuery.data?.length ?? 0;
  const successful = analyticsQuery.data?.successRate.success ?? 0;
  const failed = analyticsQuery.data?.successRate.failed ?? 0;
  const averageDuration = formatDuration(analyticsQuery.data?.averageDurationMs ?? null);

  return (
    <PageContainer title="Automation Center">
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatsCard label="Total rules" value={totalRules} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatsCard label="Active rules" value={activeRules} accentColor={healthStatusColors.healthy} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatsCard label="Running" value={runningExecutions} accentColor={healthStatusColors.warning} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatsCard label="Successful" value={successful} accentColor={healthStatusColors.healthy} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatsCard label="Failed" value={failed} accentColor={healthStatusColors.critical} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatsCard label="Pending approval" value={pendingApprovals} accentColor={healthStatusColors.warning} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatsCard label="Avg. duration" value={averageDuration} />
        </Grid>
      </Grid>

      <Tabs value={tab} onChange={(_event, value: Tab) => setTab(value)} sx={{ mb: 3 }}>
        {TABS.map((value) => (
          <Tab key={value} value={value} label={TAB_LABELS[value]} />
        ))}
      </Tabs>

      {tab === "overview" && <AutomationOverviewTab />}
      {tab === "rules" && <AutomationRulesTab />}
      {tab === "executions" && <AutomationExecutionsTab />}
      {tab === "approvals" && <AutomationApprovalsTab />}
      {tab === "templates" && <AutomationTemplatesTab />}
      {tab === "history" && <AutomationHistoryTab />}
    </PageContainer>
  );
}
