export interface IncidentAnalysis {
  summary: string;
  rootCause: string;
  recommendation: string;
  // Phase 9 "AI Incident Assistant Erweiterung" - zusaetzlich zu den
  // bestehenden drei Feldern (Phase 2).
  affectedSystems: string[];
  recommendedSteps: string[];
  confidenceScore: number;
}

// Zusaetzlicher, rein lesender Kontext, den incident-analyzer.ts aus der DB
// zusammenstellt (historische Incidents/aehnliche Fehler/betroffene
// Komponenten/Response-Time-Trend) - kein Teil der Ausgabe, sondern
// Eingabe fuer den Prompt.
export interface IncidentAnalysisContext {
  similarPastIncidents: Array<{ title: string; resolvedAfterMs: number | null; occurredAt: string }>;
  affectedComponents: string[];
  responseTimeTrend: "IMPROVING" | "DEGRADING" | "STABLE" | "UNKNOWN";
}
