import { useQuery } from "@tanstack/react-query";
import {
  fetchApiAnalyticsOverview,
  fetchApiAnalyticsTimeseries,
  fetchApiKeyUsageDetail,
  fetchPlanLimits,
  fetchPlatformOverview,
  fetchPlatformUsage,
  fetchTenantAnalytics,
} from "../api/platform.api";
import { queryKeys } from "./queryKeys";
import type { ApiUsageGranularity } from "../types/api-usage.types";

const PLATFORM_REFRESH_MS = 30_000;

// Phase 15 - /api/platform* ist Platform-Owner-only (mit Fallback auf
// authorizeGlobalAdmin, siehe Backend), daher wie useBackups()/useAuditLog()
// (Phase 13) ein optionaler enabled-Parameter statt fuer Nicht-Admins einen
// 403-Request auszuloesen.
export function usePlatformOverview(enabled = true) {
  return useQuery({ queryKey: queryKeys.platformOverview, queryFn: fetchPlatformOverview, refetchInterval: PLATFORM_REFRESH_MS, enabled });
}

export function useTenantAnalytics(organizationId?: string, teamId?: string, hours = 24 * 30, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tenantAnalytics(organizationId, teamId),
    queryFn: () => fetchTenantAnalytics(organizationId, teamId, hours),
    refetchInterval: PLATFORM_REFRESH_MS,
    enabled,
  });
}

export function usePlatformUsage(organizationId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.platformUsage(organizationId),
    queryFn: () => fetchPlatformUsage(organizationId),
    refetchInterval: PLATFORM_REFRESH_MS,
    enabled,
  });
}

// Phase 19 "Enterprise Observability, API Analytics & Operational
// Intelligence".
export function useApiAnalyticsOverview(organizationId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.apiAnalyticsOverview(organizationId),
    queryFn: () => fetchApiAnalyticsOverview(organizationId),
    refetchInterval: PLATFORM_REFRESH_MS,
    enabled,
  });
}

export function useApiAnalyticsTimeseries(organizationId?: string, hours = 24, granularity: ApiUsageGranularity = "hour", enabled = true) {
  return useQuery({
    queryKey: queryKeys.apiAnalyticsTimeseries(organizationId, hours, granularity),
    queryFn: () => fetchApiAnalyticsTimeseries(organizationId, hours, granularity),
    refetchInterval: PLATFORM_REFRESH_MS,
    enabled,
  });
}

export function useApiKeyUsageDetail(apiKeyId?: string) {
  return useQuery({
    queryKey: queryKeys.apiKeyUsageDetail(apiKeyId ?? ""),
    queryFn: () => fetchApiKeyUsageDetail(apiKeyId as string),
    enabled: Boolean(apiKeyId),
  });
}

// Phase 20 "Enterprise API Governance, Developer Portal & Credential
// Lifecycle" Auftragspunkt 7 "Developer Portal".
export function usePlanLimits(organizationId?: string) {
  return useQuery({
    queryKey: queryKeys.planLimits(organizationId ?? ""),
    queryFn: () => fetchPlanLimits(organizationId as string),
    enabled: Boolean(organizationId),
  });
}
