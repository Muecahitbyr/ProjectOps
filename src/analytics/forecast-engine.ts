import type { ForecastMetric, ForecastPoint, ForecastResult } from "../types/forecast.types";

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

// Phase 13 Teil 10 "Predictive Analytics" - "nur statistische Modelle,
// keine KI": eine gewoehnliche lineare Regression (kleinste Quadrate) ueber
// echte Zeitreihenpunkte. Unter MIN_POINTS Datenpunkten wird kein Trend
// erfunden, sondern ehrlich sufficientData=false zurueckgegeben.
const MIN_POINTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function fitLinearRegression(xs: number[], ys: number[]): { intercept: number; slope: number; rSquared: number } {
  const n = xs.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    numerator += dx * (ys[i]! - meanY);
    denominator += dx * dx;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;

  // "Prediction Accuracy" (Dashboard/Analytics-Erweiterung) - bewusst kein
  // Backtest gegen zukuenftige, noch unbekannte Werte (das waere erfunden),
  // sondern das Bestimmtheitsmass R^2 der tatsaechlichen Regression: wie gut
  // erklaert die Gerade die REALE Streuung der historischen Punkte. 0 = die
  // Gerade erklaert nichts, 1 = perfekte Anpassung. Ein Standard-
  // statistisches Mass, keine KI, keine Schaetzung ueber unbekannte Daten.
  let totalSumSquares = 0;
  let residualSumSquares = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * xs[i]!;
    residualSumSquares += (ys[i]! - predicted) ** 2;
    totalSumSquares += (ys[i]! - meanY) ** 2;
  }
  const rSquared = totalSumSquares === 0 ? 1 : Math.max(0, 1 - residualSumSquares / totalSumSquares);

  return { intercept, slope, rSquared };
}

export function forecastLinear(
  metric: ForecastMetric,
  history: TimeSeriesPoint[],
  forecastDays: number,
): ForecastResult {
  if (history.length < MIN_POINTS) {
    return { metric, sufficientData: false, method: "linear-regression", slopePerDay: null, rSquared: null, points: [] };
  }

  const sorted = [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const baseTime = new Date(sorted[0]!.timestamp).getTime();
  const xs = sorted.map((point) => (new Date(point.timestamp).getTime() - baseTime) / DAY_MS);
  const ys = sorted.map((point) => point.value);

  const { intercept, slope, rSquared } = fitLinearRegression(xs, ys);

  const historicalPoints: ForecastPoint[] = sorted.map((point) => ({
    timestamp: point.timestamp,
    value: point.value,
    predicted: false,
  }));

  const lastX = xs[xs.length - 1]!;
  const lastTimestamp = new Date(sorted[sorted.length - 1]!.timestamp).getTime();
  const predictedPoints: ForecastPoint[] = [];
  for (let day = 1; day <= forecastDays; day++) {
    const x = lastX + day;
    const predictedValue = Math.max(0, intercept + slope * x);
    predictedPoints.push({
      timestamp: new Date(lastTimestamp + day * DAY_MS).toISOString(),
      value: Math.round(predictedValue * 100) / 100,
      predicted: true,
    });
  }

  return {
    metric,
    sufficientData: true,
    method: "linear-regression",
    slopePerDay: Math.round(slope * 1000) / 1000,
    rSquared: Math.round(rSquared * 1000) / 1000,
    points: [...historicalPoints, ...predictedPoints],
  };
}
