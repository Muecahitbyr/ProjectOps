// Phase 13 Teil 10 "Predictive Analytics" - ausschliesslich statistische
// Modelle (lineare Regression ueber echte Zeitreihen), keine KI. Ohne
// mindestens MIN_FORECAST_POINTS echte Datenpunkte liefert jede
// Forecast-Funktion sufficientData=false statt eines erfundenen Trends.
export type ForecastMetric =
  | "INCIDENT_COUNT"
  | "FAILURE_RATE"
  | "RESPONSE_TIME"
  | "DISK_USAGE"
  | "HEALTH_SCORE"
  | "CAPACITY";

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
  // Bestimmtheitsmass (R^2) der Regression ueber die historischen Punkte -
  // 0..1, dient als "Prediction Accuracy"-Kennzahl. Kein Backtest gegen
  // unbekannte Zukunftswerte, siehe forecast-engine.ts.
  rSquared: number | null;
  points: ForecastPoint[];
}
