// Spiegelt src/types/forecast.types.ts im Backend.
export type ForecastMetric = "INCIDENT_COUNT" | "FAILURE_RATE" | "RESPONSE_TIME" | "DISK_USAGE" | "HEALTH_SCORE" | "CAPACITY";

export interface ForecastPoint {
  timestamp: string;
  value: number;
  predicted: boolean;
}

export interface ForecastResult {
  metric: ForecastMetric;
  sufficientData: boolean;
  method: "linear-regression";
  slopePerDay: number | null;
  rSquared: number | null;
  points: ForecastPoint[];
}
