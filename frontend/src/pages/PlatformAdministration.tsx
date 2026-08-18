import { useState } from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Grid from "@mui/material/Grid";
import { PageContainer } from "../components/layout/PageContainer";
import { StatsCard } from "../components/dashboard/StatsCard";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { OrganizationsTab } from "../components/platform/OrganizationsTab";
import { TeamsTab } from "../components/platform/TeamsTab";
import { TenantsTab } from "../components/platform/TenantsTab";
import { PlansTab } from "../components/platform/PlansTab";
import { UsageTab } from "../components/platform/UsageTab";
import { ApiKeysTab } from "../components/platform/ApiKeysTab";
import { ServiceAccountsTab } from "../components/platform/ServiceAccountsTab";
import { WebhooksTab } from "../components/platform/WebhooksTab";
import { GlobalAuditTab } from "../components/platform/GlobalAuditTab";
import { ApiDocumentationTab } from "../components/platform/ApiDocumentationTab";
import { usePlatformOverview } from "../hooks/usePlatform";
import { getErrorMessage } from "../utils/getErrorMessage";
import { healthStatusColors } from "../theme/statusColors";

const TABS = ["organizations", "teams", "tenants", "plans", "usage", "api-keys", "service-accounts", "webhooks", "api-docs", "audit"] as const;
type PlatformTab = (typeof TABS)[number];

const TAB_LABELS: Record<PlatformTab, string> = {
  organizations: "Organizations",
  teams: "Teams",
  tenants: "Tenants",
  plans: "Plans",
  usage: "Usage",
  "api-keys": "API Keys",
  "service-accounts": "Service Accounts",
  webhooks: "Webhooks",
  "api-docs": "API Docs",
  audit: "Global Audit",
};

// Phase 15 Teil 9 "Global Administration" - eine Seite, zehn In-Page-Tabs
// (analog zu AutomationCenter.tsx/ClusterCenter.tsx, Phase 11/14: ein
// zusammenhaengendes Werkzeug statt echter Unterrouten). Platform-Owner-only
// (mit Fallback auf authorizeGlobalAdmin, siehe Backend-Kommentar in
// middleware/authorize.ts). "Teams" ist additiv neben den 8 explizit
// benannten Phase-15-Tabs ergaenzt (siehe Phase-15-Abschlussbericht);
// "API Docs" ist additiv fuer Phase 16 Auftragspunkt 11/17 ergaenzt.
export function PlatformAdministration() {
  const [tab, setTab] = useState<PlatformTab>("organizations");
  const overviewQuery = usePlatformOverview();

  return (
    <PageContainer title="Platform Administration">
      {overviewQuery.isLoading ? (
        <LoadingState label="Loading platform overview..." minHeight={120} />
      ) : overviewQuery.isError || !overviewQuery.data ? (
        <ErrorState message={getErrorMessage(overviewQuery.error)} onRetry={() => overviewQuery.refetch()} minHeight={120} />
      ) : (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
            <StatsCard label="Organizations" value={overviewQuery.data.organizationCount} accentColor={healthStatusColors.healthy} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
            <StatsCard label="Teams" value={overviewQuery.data.teamCount} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
            <StatsCard label="API Keys" value={overviewQuery.data.apiKeyCount} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
            <StatsCard label="Service Accounts" value={overviewQuery.data.serviceAccountCount} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
            <StatsCard label="Webhooks" value={overviewQuery.data.webhookCount} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
            <StatsCard label="API Requests" value={overviewQuery.data.totalApiUsageCount} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
            <StatsCard
              label="Dead Letter Deliveries"
              value={overviewQuery.data.deadLetterWebhookDeliveries}
              accentColor={overviewQuery.data.deadLetterWebhookDeliveries > 0 ? healthStatusColors.critical : undefined}
            />
          </Grid>
        </Grid>
      )}

      <Tabs value={tab} onChange={(_event, value: PlatformTab) => setTab(value)} sx={{ mb: 3 }} variant="scrollable" scrollButtons="auto">
        {TABS.map((value) => (
          <Tab key={value} value={value} label={TAB_LABELS[value]} />
        ))}
      </Tabs>

      {tab === "organizations" && <OrganizationsTab />}
      {tab === "teams" && <TeamsTab />}
      {tab === "tenants" && <TenantsTab />}
      {tab === "plans" && <PlansTab />}
      {tab === "usage" && <UsageTab />}
      {tab === "api-keys" && <ApiKeysTab />}
      {tab === "service-accounts" && <ServiceAccountsTab />}
      {tab === "webhooks" && <WebhooksTab />}
      {tab === "api-docs" && <ApiDocumentationTab />}
      {tab === "audit" && <GlobalAuditTab />}
    </PageContainer>
  );
}
