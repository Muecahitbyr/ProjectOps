// Phase 58 "Enterprise Operational Risk Correlation" - Bestandsanalyse-
// Ergebnis: core/decision-context.ts (Phase 50, erweitert 53-57) korreliert
// bereits umfassend, aber AUSSCHLIESSLICH innerhalb EINES Projekts. Es gab
// keine Stelle, die erkennt, wenn mehrere unabhaengige Projekte GLEICHZEITIG
// durch DIESELBE Ursache betroffen sind (dieselbe unhealthy kritische
// Dependency, Phase 56, oder derselbe kapazitaetsgefaehrdete Agent, Phase
// 55) - jedes betroffene Projekt zeigte sein eigenes Signal bisher isoliert.
// Diese Datei ergaenzt AUSSCHLIESSLICH die dafuer noetigen Gruppierungstypen
// - keine neue Rohsignalquelle, keine neue Risikoberechnung (siehe
// core/risk-correlation.ts - reine Gruppierung bereits bestehender Signale).
export type RiskCorrelationRootCauseKind = "DEPENDENCY" | "AGENT_CAPACITY";

export interface RiskCorrelationAffectedProject {
  projectId: string;
  projectName: string;
  resilienceStatus: "HEALTHY" | "DEGRADED" | "AT_RISK" | "CRITICAL" | "UNKNOWN";
}

export interface RiskCorrelationGroup {
  rootCauseKind: RiskCorrelationRootCauseKind;
  // Service-ID (als String) fuer DEPENDENCY, Agent-ID fuer AGENT_CAPACITY -
  // absichtlich ein einheitliches String-Feld statt zweier optionaler
  // typisierter Felder, da genau EINE der beiden Bedeutungen je nach
  // rootCauseKind gilt (kein sinnvoller gemeinsamer numerischer Typ).
  rootCauseId: string;
  rootCauseName: string;
  severity: "WARNING" | "CRITICAL";
  affectedProjects: RiskCorrelationAffectedProject[];
  recommendedAction: string;
}

export interface RiskCorrelationOverview {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  candidatesEvaluated: number;
  groups: RiskCorrelationGroup[];
}
