import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { StatsCard } from "../components/dashboard/StatsCard";
import { ApiKeysTab } from "../components/platform/ApiKeysTab";
import { ApiDocumentationTab } from "../components/platform/ApiDocumentationTab";
import { useOrganizations } from "../hooks/useOrganizations";
import { useApiKeys } from "../hooks/useApiKeys";
import { usePlanLimits } from "../hooks/usePlatform";
import { getErrorMessage } from "../utils/getErrorMessage";
import { deriveApiKeyStatus } from "../types/api-key.types";

const TABS = ["overview", "credentials", "documentation", "usage"] as const;
type DeveloperTab = (typeof TABS)[number];

const TAB_LABELS: Record<DeveloperTab, string> = {
  overview: "API Overview",
  credentials: "Credentials",
  documentation: "Documentation",
  usage: "Usage",
};

// Reine Anzeige, keine neue Datenquelle - dieselben neun/elf Scopes, die
// API_SCOPES (types/api-scope.types.ts) bereits als Quelle der Wahrheit
// fuehrt, nur nach Kategorie gruppiert dargestellt ("verfuegbare APIs").
const AVAILABLE_APIS = [
  { name: "Projects", scopes: "projects:read" },
  { name: "Incidents", scopes: "incidents:read, incidents:write" },
  { name: "Tenant Analytics", scopes: "analytics:read" },
  { name: "Alerts", scopes: "alerts:read, alerts:write" },
  { name: "Automation Actions & Executions", scopes: "automation:read, automation:execute" },
  { name: "Automation Rules", scopes: "automation:read, automation:write" },
  { name: "Usage & API Analytics", scopes: "usage:read" },
  { name: "API Key Management", scopes: "api-key-management:read, api-key-management:write" },
];

// Phase 20 "Enterprise API Governance, Developer Portal & Credential
// Lifecycle" Auftragspunkt 7 "Developer Portal" - EIGENE Seite unter
// /platform/developer (nicht als weiterer Tab in PlatformAdministration.tsx,
// wie im Auftrag explizit als eigener Pfad verlangt), aber dieselbe
// Platform-Owner-only-Absicherung. "Credentials" und "Documentation"
// betten die BESTEHENDEN Komponenten (ApiKeysTab/ApiDocumentationTab)
// unveraendert ein - keine zweite Implementierung. "Usage" verlinkt
// ausschliesslich auf die bestehende /platform/api-analytics-Seite (Phase
// 19) statt eine zweite Analytics-Ansicht zu bauen.
export function DeveloperPortal() {
  const [tab, setTab] = useState<DeveloperTab>("overview");
  const [organizationId, setOrganizationId] = useState("");
  const navigate = useNavigate();

  const organizationsQuery = useOrganizations();
  const apiKeysQuery = useApiKeys(organizationId || undefined);
  const planLimitsQuery = usePlanLimits(organizationId || undefined);

  const activeKeyCount = (apiKeysQuery.data ?? []).filter((key) => deriveApiKeyStatus(key) === "ACTIVE").length;

  return (
    <PageContainer title="Developer Portal">
      <Stack sx={{ gap: 3 }}>
        <Tabs value={tab} onChange={(_event, value: DeveloperTab) => setTab(value)} variant="scrollable" scrollButtons="auto">
          {TABS.map((value) => (
            <Tab key={value} value={value} label={TAB_LABELS[value]} />
          ))}
        </Tabs>

        {tab === "overview" ? (
          <Stack sx={{ gap: 3 }}>
            <TextField select label="Organization" size="small" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} sx={{ minWidth: 240 }}>
              <MenuItem value="">Select an organization</MenuItem>
              {(organizationsQuery.data ?? []).map((org) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.name}
                </MenuItem>
              ))}
            </TextField>

            <Card>
              <CardContent>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="h4">API Version</Typography>
                  <Chip label="v1" />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Base URL: <code>/api/v1</code> - authenticated via <code>X-API-Key</code> or <code>Authorization: Bearer</code>. See the
                  Documentation tab for the full endpoint reference.
                </Typography>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1 }}>
                  Available APIs
                </Typography>
                <Stack sx={{ gap: 1 }}>
                  {AVAILABLE_APIS.map((api) => (
                    <Stack key={api.name} direction="row" sx={{ justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                      <Typography variant="body2">{api.name}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                        {api.scopes}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            {!organizationId ? null : planLimitsQuery.isLoading ? (
              <LoadingState label="Loading plan limits..." minHeight={120} />
            ) : planLimitsQuery.isError || !planLimitsQuery.data ? (
              <ErrorState message={getErrorMessage(planLimitsQuery.error)} onRetry={() => planLimitsQuery.refetch()} minHeight={120} />
            ) : (
              <>
                <Card>
                  <CardContent>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                      <Typography variant="h4">Rate Limits &amp; Quotas</Typography>
                      <Chip size="small" variant="outlined" label={planLimitsQuery.data.plan} />
                    </Stack>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 6, sm: 4 }}>
                        <StatsCard label="Read req/min" value={planLimitsQuery.data.limits.apiRequestsPerMinute} />
                      </Grid>
                      <Grid size={{ xs: 6, sm: 4 }}>
                        <StatsCard label="Write req/min" value={planLimitsQuery.data.limits.apiWriteRequestsPerMinute} />
                      </Grid>
                      <Grid size={{ xs: 6, sm: 4 }}>
                        <StatsCard label="Execute req/min" value={planLimitsQuery.data.limits.apiExecuteRequestsPerMinute} />
                      </Grid>
                      <Grid size={{ xs: 6, sm: 4 }}>
                        <StatsCard label="Requests/day" value={planLimitsQuery.data.limits.apiRequestsPerDay} />
                      </Grid>
                      <Grid size={{ xs: 6, sm: 4 }}>
                        <StatsCard label="Automation executions/day" value={planLimitsQuery.data.limits.automationExecutionsPerDay} />
                      </Grid>
                      <Grid size={{ xs: 6, sm: 4 }}>
                        <StatsCard label="Max API keys" value={planLimitsQuery.data.limits.maxApiKeys} />
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <StatsCard label="Your active API keys" value={activeKeyCount} />
                  </Grid>
                </Grid>
              </>
            )}
          </Stack>
        ) : null}

        {tab === "credentials" ? <ApiKeysTab /> : null}

        {tab === "documentation" ? <ApiDocumentationTab /> : null}

        {tab === "usage" ? (
          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1 }}>
                API Usage &amp; Analytics
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Request volume, error rates, latency trends, and per-key usage live on the dedicated API Analytics page.
              </Typography>
              <Button variant="contained" endIcon={<OpenInNewOutlinedIcon />} onClick={() => navigate("/platform/api-analytics")}>
                Open API Analytics
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </Stack>
    </PageContainer>
  );
}
