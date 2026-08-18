import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import WhatshotOutlinedIcon from "@mui/icons-material/WhatshotOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import NotificationsPausedOutlinedIcon from "@mui/icons-material/NotificationsPausedOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import BackupOutlinedIcon from "@mui/icons-material/BackupOutlined";
import ChecklistOutlinedIcon from "@mui/icons-material/ChecklistOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import HealthAndSafetyOutlinedIcon from "@mui/icons-material/HealthAndSafetyOutlined";
import CorporateFareOutlinedIcon from "@mui/icons-material/CorporateFareOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import ApiOutlinedIcon from "@mui/icons-material/ApiOutlined";
import WebhookOutlinedIcon from "@mui/icons-material/WebhookOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { HealthScoreCard } from "../components/dashboard/HealthScoreCard";
import { StatsCard } from "../components/dashboard/StatsCard";
import { EventFeed } from "../components/dashboard/EventFeed";
import { ServiceReliabilityPanel } from "../components/dashboard/ServiceReliabilityPanel";
import { TimelineChart } from "../components/dashboard/TimelineChart";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useDashboardEvents, useDashboardSummary, useTimeline } from "../hooks/useDashboard";
import { useProjectsHealth } from "../hooks/useProjects";
import { useUsers } from "../hooks/useUsers";
import { useAlertRules } from "../hooks/useAlerts";
import { useAlertEvents } from "../hooks/useAlertEvents";
import { useMaintenanceWindows } from "../hooks/useMaintenance";
import { useNotificationChannels } from "../hooks/useNotificationSettings";
import { useMonitoringAgents } from "../hooks/useMonitoringAgents";
import { useBackups } from "../hooks/useBackups";
import { useAuditLog } from "../hooks/useAudit";
import { useDisasterRecoveryReport } from "../hooks/useDiagnostics";
import { useForecast } from "../hooks/useForecast";
import { usePlatformOverview, useTenantAnalytics } from "../hooks/usePlatform";
import { useSlos } from "../hooks/useSlo";
import { useAuth } from "../auth/AuthContext";
import { getErrorMessage } from "../utils/getErrorMessage";
import { healthStatusColors } from "../theme/statusColors";

const DR_STATUS_COLOR: Record<"HEALTHY" | "DEGRADED" | "CRITICAL", string> = {
  HEALTHY: healthStatusColors.healthy,
  DEGRADED: healthStatusColors.warning,
  CRITICAL: healthStatusColors.critical,
};

// Phase 13 Teil 10 "Predictive Analytics" - "Prediction Accuracy"-Widget:
// Durchschnitt des R^2-Bestimmtheitsmasses (siehe forecast-engine.ts) ueber
// alle 6 Forecast-Metriken mit ausreichend Datenpunkten. Eigene Komponente,
// da useForecast() sechsmal mit festen Literalen aufgerufen werden muss
// (Rules of Hooks - keine Schleife ueber ein Array).
function PredictionAccuracyWidget() {
  const incident = useForecast("INCIDENT_COUNT");
  const failure = useForecast("FAILURE_RATE");
  const responseTime = useForecast("RESPONSE_TIME");
  const disk = useForecast("DISK_USAGE");
  const health = useForecast("HEALTH_SCORE");
  const capacity = useForecast("CAPACITY");

  const results = [incident, failure, responseTime, disk, health, capacity];
  const isLoading = results.some((result) => result.isLoading);
  const withData = results.map((result) => result.data).filter((data) => data?.sufficientData && data.rSquared !== null);

  const averageRSquared =
    withData.length > 0 ? withData.reduce((sum, data) => sum + (data!.rSquared ?? 0), 0) / withData.length : null;

  return (
    <StatsCard
      label="Prediction Accuracy (R²)"
      value={isLoading ? "…" : averageRSquared === null ? "n/a" : `${Math.round(averageRSquared * 100)}%`}
      icon={<ScienceOutlinedIcon />}
      accentColor={averageRSquared !== null && averageRSquared >= 0.5 ? healthStatusColors.healthy : undefined}
    />
  );
}

export function Dashboard() {
  const summaryQuery = useDashboardSummary();
  const projectsQuery = useProjectsHealth();
  const eventsQuery = useDashboardEvents();
  const timelineQuery = useTimeline({ hours: 24, limit: 300 });
  const usersQuery = useUsers();
  const alertsQuery = useAlertRules();
  const channelsQuery = useNotificationChannels();
  const criticalAlertsQuery = useAlertEvents({ status: "TRIGGERED", severity: "CRITICAL" });
  const suppressedAlertsQuery = useAlertEvents({ status: "SUPPRESSED" });
  const maintenanceQuery = useMaintenanceWindows();
  const { isGlobalAdmin } = useAuth();
  const agentsQuery = useMonitoringAgents();
  const backupsQuery = useBackups(isGlobalAdmin);
  const auditQuery = useAuditLog({ limit: 50 }, isGlobalAdmin);
  const disasterRecoveryQuery = useDisasterRecoveryReport();
  const platformOverviewQuery = usePlatformOverview(isGlobalAdmin);
  const tenantAnalyticsQuery = useTenantAnalytics(undefined, undefined, 24 * 30, isGlobalAdmin);
  const sloQuery = useSlos({}, isGlobalAdmin);

  if (summaryQuery.isLoading) {
    return (
      <PageContainer title="Dashboard">
        <LoadingState label="Loading dashboard..." minHeight={400} />
      </PageContainer>
    );
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <PageContainer title="Dashboard">
        <ErrorState message={getErrorMessage(summaryQuery.error)} onRetry={() => summaryQuery.refetch()} />
      </PageContainer>
    );
  }

  const { summary } = summaryQuery.data;
  const projectScores = (projectsQuery.data ?? []).map((project) => project.health.score);
  const averageScore =
    projectScores.length > 0 ? Math.round(projectScores.reduce((sum, score) => sum + score, 0) / projectScores.length) : 0;

  const onlineUsers = (usersQuery.data ?? []).filter((user) => user.presence.online).length;
  const totalUsers = (usersQuery.data ?? []).length;
  const openAlertRules = (alertsQuery.data ?? []).filter((rule) => rule.currentlyTriggered).length;
  const notificationChannels = channelsQuery.data ?? [];
  const activeCriticalAlerts = criticalAlertsQuery.data?.total ?? 0;
  const suppressedAlerts = suppressedAlertsQuery.data?.total ?? 0;
  const activeMaintenanceCount = (maintenanceQuery.data ?? []).filter((window) => window.active).length;
  const onlineAgents = (agentsQuery.data ?? []).filter((agent) => agent.status === "ONLINE").length;
  const totalAgents = (agentsQuery.data ?? []).length;
  const onlineRegions = new Set(
    (agentsQuery.data ?? []).filter((agent) => agent.status === "ONLINE" && agent.region !== null).map((agent) => agent.region),
  ).size;
  const upcomingMaintenanceCount = (maintenanceQuery.data ?? []).filter((window) => new Date(window.startsAt).getTime() > Date.now()).length;
  const totalRecordsStored = (tenantAnalyticsQuery.data ?? []).reduce((sum, tenant) => sum + tenant.recordsStored, 0);

  return (
    <PageContainer title="Dashboard">
      <Grid container spacing={3}>
        <Grid size={12}>
          <HealthScoreCard status={summaryQuery.data.status} score={averageScore} />
        </Grid>

        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard label="Projects" value={summary.projects.total} icon={<AppsOutlinedIcon />} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard label="Checks" value={summary.checks.total} icon={<FactCheckOutlinedIcon />} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Online"
            value={summary.checks.online}
            icon={<CheckCircleOutlineIcon />}
            accentColor={healthStatusColors.healthy}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Open Incidents"
            value={summary.incidents.open}
            icon={<ReportProblemOutlinedIcon />}
            accentColor={summary.incidents.open > 0 ? healthStatusColors.warning : undefined}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Critical Incidents"
            value={summary.incidents.critical}
            icon={<WhatshotOutlinedIcon />}
            accentColor={summary.incidents.critical > 0 ? healthStatusColors.critical : undefined}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 2 }}>
                Response Time - Last 24h
              </Typography>
              {timelineQuery.isLoading ? (
                <LoadingState minHeight={260} />
              ) : timelineQuery.isError ? (
                <ErrorState message={getErrorMessage(timelineQuery.error)} onRetry={() => timelineQuery.refetch()} />
              ) : (
                <TimelineChart points={timelineQuery.data?.items ?? []} />
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 1 }}>
                Live Feed
              </Typography>
              {eventsQuery.isLoading ? (
                <LoadingState minHeight={200} />
              ) : eventsQuery.isError ? (
                <ErrorState message={getErrorMessage(eventsQuery.error)} onRetry={() => eventsQuery.refetch()} />
              ) : (
                <EventFeed events={eventsQuery.data ?? []} />
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatsCard
            label="Online Users"
            value={usersQuery.isLoading ? "…" : `${onlineUsers}/${totalUsers}`}
            icon={<PeopleAltOutlinedIcon />}
            accentColor={onlineUsers > 0 ? healthStatusColors.healthy : undefined}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatsCard
            label="Open Alert Rules"
            value={alertsQuery.isLoading ? "…" : openAlertRules}
            icon={<NotificationsActiveOutlinedIcon />}
            accentColor={openAlertRules > 0 ? healthStatusColors.critical : undefined}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 1 }}>
                Notification Channels
              </Typography>
              {channelsQuery.isLoading ? (
                <LoadingState minHeight={100} />
              ) : channelsQuery.isError ? (
                <ErrorState message={getErrorMessage(channelsQuery.error)} onRetry={() => channelsQuery.refetch()} />
              ) : (
                <Stack divider={<Divider />}>
                  {notificationChannels.map((channel) => (
                    <Stack key={channel.id} direction="row" sx={{ justifyContent: "space-between", py: 0.75 }}>
                      <Typography variant="body2" color="text.secondary">
                        {channel.id}
                      </Typography>
                      <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {channel.enabledUserCount} active
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatsCard
            label="Active Critical Alerts"
            value={criticalAlertsQuery.isLoading ? "…" : activeCriticalAlerts}
            icon={<NotificationsActiveOutlinedIcon />}
            accentColor={activeCriticalAlerts > 0 ? healthStatusColors.critical : undefined}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatsCard
            label="Suppressed Alerts"
            value={suppressedAlertsQuery.isLoading ? "…" : suppressedAlerts}
            icon={<NotificationsPausedOutlinedIcon />}
            accentColor={suppressedAlerts > 0 ? healthStatusColors.warning : undefined}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatsCard
            label="Maintenance Windows Active"
            value={maintenanceQuery.isLoading ? "…" : activeMaintenanceCount}
            icon={<BuildOutlinedIcon />}
            accentColor={activeMaintenanceCount > 0 ? healthStatusColors.warning : undefined}
          />
        </Grid>

        {/* Phase 13 "Dashboard Erweiterung" - 7 neue Widgets. */}
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Active Monitoring Agents"
            value={agentsQuery.isLoading ? "…" : `${onlineAgents}/${totalAgents}`}
            icon={<HubOutlinedIcon />}
            accentColor={totalAgents > 0 && onlineAgents < totalAgents ? healthStatusColors.warning : healthStatusColors.healthy}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard label="Regions Online" value={agentsQuery.isLoading ? "…" : onlineRegions} icon={<PublicOutlinedIcon />} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Backups"
            value={!isGlobalAdmin ? "—" : backupsQuery.isLoading ? "…" : (backupsQuery.data ?? []).length}
            icon={<BackupOutlinedIcon />}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Audit Events (recent)"
            value={!isGlobalAdmin ? "—" : auditQuery.isLoading ? "…" : (auditQuery.data ?? []).length}
            icon={<ChecklistOutlinedIcon />}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <PredictionAccuracyWidget />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Upcoming Maintenance"
            value={maintenanceQuery.isLoading ? "…" : upcomingMaintenanceCount}
            icon={<BuildOutlinedIcon />}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Disaster Recovery"
            value={disasterRecoveryQuery.isLoading ? "…" : disasterRecoveryQuery.data?.status ?? "unknown"}
            icon={<HealthAndSafetyOutlinedIcon />}
            accentColor={disasterRecoveryQuery.data ? DR_STATUS_COLOR[disasterRecoveryQuery.data.status] : undefined}
          />
        </Grid>

        {/* Phase 15 "Dashboard Erweiterung" - 8 neue Widgets. Platform-Owner-only
            (mit Fallback auf authorizeGlobalAdmin, siehe usePlatform.ts), daher
            wie "Backups"/"Audit Events (recent)" oben ein "—"-Platzhalter fuer
            Nicht-Admins statt eines ungueltigen Requests. */}
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Organizations"
            value={!isGlobalAdmin ? "—" : platformOverviewQuery.isLoading ? "…" : platformOverviewQuery.data?.organizationCount ?? 0}
            icon={<CorporateFareOutlinedIcon />}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Teams"
            value={!isGlobalAdmin ? "—" : platformOverviewQuery.isLoading ? "…" : platformOverviewQuery.data?.teamCount ?? 0}
            icon={<GroupsOutlinedIcon />}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="API Requests"
            value={!isGlobalAdmin ? "—" : platformOverviewQuery.isLoading ? "…" : platformOverviewQuery.data?.totalApiUsageCount ?? 0}
            icon={<ApiOutlinedIcon />}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Webhook Deliveries (pending)"
            value={!isGlobalAdmin ? "—" : platformOverviewQuery.isLoading ? "…" : platformOverviewQuery.data?.pendingWebhookDeliveries ?? 0}
            icon={<WebhookOutlinedIcon />}
            accentColor={
              isGlobalAdmin && (platformOverviewQuery.data?.deadLetterWebhookDeliveries ?? 0) > 0 ? healthStatusColors.warning : undefined
            }
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Platform Health"
            value={!isGlobalAdmin ? "—" : platformOverviewQuery.isLoading ? "…" : (platformOverviewQuery.data?.deadLetterWebhookDeliveries ?? 0) === 0 ? "healthy" : "degraded"}
            icon={<HealthAndSafetyOutlinedIcon />}
            accentColor={
              !isGlobalAdmin || platformOverviewQuery.isLoading
                ? undefined
                : (platformOverviewQuery.data?.deadLetterWebhookDeliveries ?? 0) === 0
                  ? healthStatusColors.healthy
                  : healthStatusColors.critical
            }
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Tenant Count"
            value={!isGlobalAdmin ? "—" : platformOverviewQuery.isLoading ? "…" : platformOverviewQuery.data?.activeOrganizationCount ?? 0}
            icon={<CorporateFareOutlinedIcon />}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Storage Usage (records)"
            value={!isGlobalAdmin ? "—" : tenantAnalyticsQuery.isLoading ? "…" : totalRecordsStored}
            icon={<StorageOutlinedIcon />}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="API Key Usage"
            value={!isGlobalAdmin ? "—" : platformOverviewQuery.isLoading ? "…" : platformOverviewQuery.data?.apiKeyCount ?? 0}
            icon={<VpnKeyOutlinedIcon />}
          />
        </Grid>

        {isGlobalAdmin ? (
          <Grid size={{ xs: 12 }}>
            <ServiceReliabilityPanel slos={sloQuery.data ?? []} isLoading={sloQuery.isLoading} />
          </Grid>
        ) : null}
      </Grid>
    </PageContainer>
  );
}
