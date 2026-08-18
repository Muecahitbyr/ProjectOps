// Spiegelt src/types/health.types.ts und src/types/check-result.types.ts im
// Backend. Werte muessen exakt uebereinstimmen, da sie 1:1 aus der API kommen.
export type HealthStatus = "healthy" | "warning" | "critical";

export type CheckStatus = "ONLINE" | "WARNING" | "OFFLINE" | "ERROR";

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
