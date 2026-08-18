// Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence" -
// Bestandsanalyse-Ergebnis: core/capacity-intelligence.ts (Phase 46)
// berechnet bereits forecast-basierte Fruehwarnsignale, sie werden aber bei
// jedem Request neu berechnet und NIE historisiert - es gibt daher keine
// Moeglichkeit, im Nachhinein festzustellen, ob eine Fruehwarnung tatsaechlich
// eingetroffen ist. Diese Datei ergaenzt AUSSCHLIESSLICH die dafuer noetigen
// Historisierungs-/Auswertungstypen - keine neue Rohsignalquelle (siehe
// core/proactive-risk-alerting.ts).
export type ForecastAccuracyOutcome = "CONFIRMED" | "FALSE_POSITIVE" | "PENDING";

export interface ProactiveRiskDetectionRecord {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  criticality: string | null;
  detectedAt: string;
  clearedAt: string | null;
  signalTitles: string[];
  explanation: string;
  outcome: ForecastAccuracyOutcome;
  outcomeReason: string;
}

export interface ForecastAccuracySummary {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  totalDetections: number;
  evaluatedDetections: number;
  confirmedCount: number;
  falsePositiveCount: number;
  pendingCount: number;
  // null, solange evaluatedDetections=0 - keine erfundene Genauigkeit ohne
  // mindestens einen abgeschlossenen Vergleich (Auftragspunkt 4 "keine
  // kuenstliche mathematische Praezision").
  accuracyRatePercent: number | null;
  detections: ProactiveRiskDetectionRecord[];
}
