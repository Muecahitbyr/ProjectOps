import type { PlatformOverview } from "../types/platform.types";
import type { ObservabilityCityBuildingData } from "../types/observability-city.types";

export interface EnterpriseCityInput {
  overview: PlatformOverview | undefined;
  isTenantActivityPulse: boolean;
  isTeamCollaborationPulse: boolean;
  isApiRequestsPulse: boolean;
  isWebhookQueuePulse: boolean;
  // Phase 16 Auftragspunkt 18 "Mini City" - echtes, kurzes Alert-Fenster ab
  // einem realen API_QUOTA_WARNING/EXCEEDED-Event (siehe useEnterpriseCity.ts),
  // kein erfundener Dauerzustand.
  isQuotaAlert: boolean;
}

// Reine Transformationsfunktion (analog zu clusterCityMapper.ts, Phase 14) -
// nimmt bereits geladenes /api/platform-Overview entgegen, keine eigenen
// API-Aufrufe. Phase 15 Teil 12 "Mini City Erweiterung" (Enterprise
// District). Bei fehlendem overview (kein Platform Owner / noch nicht
// geladen) zeigen alle Gebaeude ehrlich "idle" statt erfundener Werte.
export function mapEnterpriseToCity(input: EnterpriseCityInput): ObservabilityCityBuildingData[] {
  const { overview, isTenantActivityPulse, isTeamCollaborationPulse, isApiRequestsPulse, isWebhookQueuePulse, isQuotaAlert } = input;

  const organizationsHall: ObservabilityCityBuildingData = {
    id: "enterprise-organizations",
    name: "Organizations",
    type: "organizations-hall",
    status: isTenantActivityPulse ? "active" : !overview ? "idle" : overview.organizationCount > 0 ? "healthy" : "idle",
    metrics: [
      { label: "Organizations", value: String(overview?.organizationCount ?? 0) },
      { label: "Active tenants", value: String(overview?.activeOrganizationCount ?? 0) },
    ],
  };

  const teamsHub: ObservabilityCityBuildingData = {
    id: "enterprise-teams",
    name: "Teams",
    type: "teams-hub",
    status: isTeamCollaborationPulse ? "active" : !overview ? "idle" : overview.teamCount > 0 ? "healthy" : "idle",
    metrics: [{ label: "Teams", value: String(overview?.teamCount ?? 0) }],
  };

  const apiGateway: ObservabilityCityBuildingData = {
    id: "enterprise-api-gateway",
    name: "API Gateway",
    type: "api-gateway-tower",
    status: isQuotaAlert ? "alert" : isApiRequestsPulse ? "active" : !overview ? "idle" : overview.apiKeyCount > 0 ? "healthy" : "idle",
    metrics: [
      { label: "API keys", value: String(overview?.apiKeyCount ?? 0) },
      { label: "Requests", value: String(overview?.totalApiUsageCount ?? 0) },
    ],
  };

  const webhookCenter: ObservabilityCityBuildingData = {
    id: "enterprise-webhook-center",
    name: "Webhook Center",
    type: "webhook-center",
    status: isWebhookQueuePulse
      ? "active"
      : !overview
        ? "idle"
        : overview.deadLetterWebhookDeliveries > 0
          ? "alert"
          : overview.webhookCount > 0
            ? "healthy"
            : "idle",
    metrics: [
      { label: "Webhooks", value: String(overview?.webhookCount ?? 0) },
      { label: "Pending deliveries", value: String(overview?.pendingWebhookDeliveries ?? 0) },
      { label: "Dead letter", value: String(overview?.deadLetterWebhookDeliveries ?? 0) },
    ],
  };

  const platformAdmin: ObservabilityCityBuildingData = {
    id: "enterprise-platform-admin",
    name: "Platform Admin",
    type: "platform-admin-tower",
    status: !overview ? "idle" : overview.deadLetterWebhookDeliveries > 0 ? "alert" : "healthy",
    metrics: [
      { label: "Organizations", value: String(overview?.organizationCount ?? 0) },
      { label: "Service accounts", value: String(overview?.serviceAccountCount ?? 0) },
    ],
  };

  const serviceAccountsVault: ObservabilityCityBuildingData = {
    id: "enterprise-service-accounts",
    name: "Service Accounts",
    type: "service-accounts-vault",
    status: !overview ? "idle" : overview.serviceAccountCount > 0 ? "healthy" : "idle",
    metrics: [{ label: "Service accounts", value: String(overview?.serviceAccountCount ?? 0) }],
  };

  return [organizationsHall, teamsHub, apiGateway, webhookCenter, platformAdmin, serviceAccountsVault];
}
