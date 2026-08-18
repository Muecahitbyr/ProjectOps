// String-Enum: die Laufzeitwerte bleiben "healthy"/"warning"/"critical",
// damit sich die JSON-Ausgabe der Dashboard-API durch diese Refaktorierung
// nicht aendert - nur die interne Verwendung wird von losen String-Literalen
// auf einen gemeinsamen Typ umgestellt.
export enum HealthStatus {
  HEALTHY = "healthy",
  WARNING = "warning",
  CRITICAL = "critical",
}
