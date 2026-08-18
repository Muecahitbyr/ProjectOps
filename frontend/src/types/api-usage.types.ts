// Spiegelt src/types/api-usage.types.ts im Backend.
import type { ApiKey } from "./api-key.types";

export interface StatusCodeBucket {
  statusCode: number;
  count: number;
}

export interface EndpointUsageStat {
  endpoint: string;
  method: string;
  requestCount: number;
  errorCount: number;
  averageDurationMs: number | null;
}

export interface ApiKeyUsageStat {
  apiKeyId: string;
  description: string;
  requestCount: number;
  errorCount: number;
  lastUsedAt: string | null;
}

export interface ApiUsageAnalytics {
  generatedAt: string;
  requestsTotal: number;
  requestsToday: number;
  requestsLast24h: number;
  requestsLast7d: number;
  errorRatePercent: number;
  averageResponseTimeMs: number | null;
  statusCodeDistribution: StatusCodeBucket[];
  topApiKeys: ApiKeyUsageStat[];
  topEndpoints: EndpointUsageStat[];
}

// Phase 19 "Enterprise Observability, API Analytics & Operational
// Intelligence".
export interface ApiUsageTimeseriesBucket {
  timestamp: string;
  requests: number;
  errors: number;
  avgLatency: number | null;
}

export type ApiUsageGranularity = "hour" | "day";

export interface ApiAnalyticsOverview extends ApiUsageAnalytics {
  activeApiKeysCount: number;
}

// Die interne GET /api/platform/api-analytics/keys/:id-Antwort liefert das
// volle ApiKey-Objekt (Platform-Owner-Kontext, wie ApiKeysTab.tsx es
// bereits ueberall zeigt) - kein eigener, abgemagerter Typ noetig.
export interface ApiKeyUsageDetail {
  apiKey: ApiKey;
  usage: ApiUsageAnalytics;
}
