import { apiClient } from "./client";
import type { PlatformOverview, TenantAnalytics } from "../types/platform.types";
import type { ApiAnalyticsOverview, ApiKeyUsageDetail, ApiUsageAnalytics, ApiUsageGranularity, ApiUsageTimeseriesBucket } from "../types/api-usage.types";
import type { OrganizationPlanLimits } from "../types/plan-limits.types";

export async function fetchPlatformOverview(): Promise<PlatformOverview> {
  const { data } = await apiClient.get<PlatformOverview>("/api/platform");
  return data;
}

export async function fetchTenantAnalytics(organizationId?: string, teamId?: string, hours = 24 * 30): Promise<TenantAnalytics[]> {
  const { data } = await apiClient.get<TenantAnalytics[]>("/api/platform/analytics", { params: { organizationId, teamId, hours } });
  return data;
}

// Phase 16 Auftragspunkt 6/17 "Usage Analytics"/"Frontend" - erweitert um
// die echten, aus api_key_usage aggregierten Werte (siehe
// db/api-key-usage.repository.ts im Backend). PlatformUsage erweitert
// ApiUsageAnalytics additiv statt eines zweiten, parallelen Typs.
export interface PlatformUsage extends ApiUsageAnalytics {
  totalApiUsageCount: number;
  apiKeyCount: number;
  serviceAccountCount: number;
  pendingWebhookDeliveries: number;
  deadLetterWebhookDeliveries: number;
}

export async function fetchPlatformUsage(organizationId?: string): Promise<PlatformUsage> {
  const { data } = await apiClient.get<PlatformUsage>("/api/platform/usage", { params: { organizationId } });
  return data;
}

// Phase 19 "Enterprise Observability, API Analytics & Operational
// Intelligence" - interne Spiegelseite der externen /api/v1/analytics/api/*-
// Endpunkte (dieselben Backend-Aggregationsfunktionen, siehe
// routes/platform.routes.ts), fuer die neue Seite /platform/api-analytics.
export async function fetchApiAnalyticsOverview(organizationId?: string): Promise<ApiAnalyticsOverview> {
  const { data } = await apiClient.get<ApiAnalyticsOverview>("/api/platform/api-analytics/overview", { params: { organizationId } });
  return data;
}

export async function fetchApiAnalyticsTimeseries(
  organizationId?: string,
  hours = 24,
  granularity: ApiUsageGranularity = "hour",
): Promise<ApiUsageTimeseriesBucket[]> {
  const { data } = await apiClient.get<{ data: ApiUsageTimeseriesBucket[] }>("/api/platform/api-analytics/timeseries", {
    params: { organizationId, hours, granularity },
  });
  return data.data;
}

export async function fetchApiKeyUsageDetail(apiKeyId: string): Promise<ApiKeyUsageDetail> {
  const { data } = await apiClient.get<ApiKeyUsageDetail>(`/api/platform/api-analytics/keys/${apiKeyId}`);
  return data;
}

// Phase 20 "Enterprise API Governance, Developer Portal & Credential
// Lifecycle" Auftragspunkt 7 "Developer Portal" (Abschnitt A "API Overview").
export async function fetchPlanLimits(organizationId: string): Promise<OrganizationPlanLimits> {
  const { data } = await apiClient.get<OrganizationPlanLimits>("/api/platform/plan-limits", { params: { organizationId } });
  return data;
}
