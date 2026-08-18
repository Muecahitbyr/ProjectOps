// Phase 16 Auftragspunkt 5/6 "API-Key Usage Tracking"/"Usage Analytics".
export interface ApiKeyUsageRecord {
  id: string;
  apiKeyId: string;
  organizationId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  createdAt: string;
}

export interface RecordApiUsageInput {
  apiKeyId: string;
  organizationId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  // Phase 17 Auftragspunkt 13 "Usage Tracking" - additive Felder.
  mutation: boolean;
  idempotencyReplay: boolean;
  // Phase 19 Auftragspunkt 1 "API Usage Analytics" - additive Felder.
  // createdByUserId ist der Benutzer, der den API-Key angelegt hat (aus
  // api_keys.created_by, bereits beim Auth-Lookup vorhanden - kein
  // Zusatz-Query). Ein API-Key authentifiziert weiterhin eine Organisation,
  // nie einen einzelnen Benutzer pro Request (siehe middleware/
  // api-key-auth.ts) - dieses Feld ist reine Herkunfts-/Traceability-Info,
  // "userId falls vorhanden" im Auftrag.
  createdByUserId: string | null;
  requestSizeBytes: number | null;
  responseSizeBytes: number | null;
}

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

// Auftragspunkt 6 "Usage Analytics" - erweitert die bestehende Platform-
// Usage-Funktion (platform.repository.ts) um echte, aggregierte Werte statt
// des bisherigen reinen api_keys.usage_count-Summenwerts.
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

// Auftragspunkt 7/9 "API Quotas"/"Quota Headers" - der aktuelle
// Quota-Stand eines einzelnen API-Keys fuer den laufenden Kalendertag.
export interface ApiKeyQuotaStatus {
  requestsToday: number;
  dailyLimit: number;
  remaining: number;
  percentUsed: number;
}

// Phase 19 Auftragspunkt 1/2 "API Usage Analytics"/"Analytics Dashboard
// API" - gemeinsamer Filter fuer getApiUsageAnalytics()/
// getApiUsageTimeseries(): organizationId ist die Tenant-Grenze (immer
// gesetzt), apiKeyId engt zusaetzlich auf einen einzelnen Key ein (GET
// .../keys/:id), teamId engt auf ein Team ein (team-gebundene API-Keys).
export interface ApiUsageFilter {
  organizationId?: string;
  teamId?: string;
  apiKeyId?: string;
}

export interface ApiUsageTimeseriesBucket {
  timestamp: string;
  requests: number;
  errors: number;
  avgLatency: number | null;
}

export type ApiUsageGranularity = "hour" | "day";
