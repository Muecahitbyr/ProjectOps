// Phase 64 "Enterprise Operational Priority & Attention Management" -
// Bestandsanalyse-Ergebnis: Priority Queue (Phase 43) rankt bereits
// Projekte/Services, Decision Context (Phase 50-62) liefert bereits
// Begruendungen/Empfehlungen - aber beides bewusst je-Service-skaliert
// (siehe core/decision-context.ts Dateikopf) statt eine EINE, org-weite,
// nach Dringlichkeit sortierte Liste EINZELNER Incidents/Problems/Changes/
// Governance-Konflikte als eigene Eintraege zu liefern. Diese Datei traegt
// AUSSCHLIESSLICH die dafuer noetige Zusammenfuehrungs-Struktur - keine neue
// Rohsignalquelle, keine neue Bewertung (siehe core/attention.ts).
export type AttentionItemKind = "SERVICE_RISK" | "INCIDENT" | "PROBLEM" | "CHANGE" | "GOVERNANCE_CONFLICT";

// Bewusst dieselben vier Werte, die Incident.severity/Problem.priority/
// Change.risk bereits nutzen (keine neue Vokabular-Erfindung) - fuer
// SERVICE_RISK-Eintraege ueber RESILIENCE_RANK abgeleitet (siehe
// core/attention.ts).
export type AttentionTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AttentionItem {
  kind: AttentionItemKind;
  // Incident-/Problem-/Change-Id bzw. die fuehrende Automation-Rule-Id
  // eines Governance-Konflikts. null nur fuer SERVICE_RISK (kein einzelnes
  // DB-Entity, sondern eine abgeleitete Projekt-/Service-Zeile wie in der
  // Priority Queue selbst).
  entityId: number | null;
  projectId: string | null;
  projectName: string | null;
  title: string;
  tier: AttentionTier;
  reason: string;
  recommendedAction: string;
  // Wiederverwendet aus dem jeweils bereits bestehenden Feld:
  // Incident.assigneeId / Problem.ownerUserId / Change.ownerId. null fuer
  // SERVICE_RISK/GOVERNANCE_CONFLICT - fuer beide existiert bislang KEIN
  // Owner-Konzept in der Plattform (Bestandsanalyse-Ergebnis), hier bewusst
  // nicht neu erfunden.
  ownerId: string | null;
  // null nur fuer SERVICE_RISK (siehe sortSecondary unten).
  createdAt: string | null;
  // Nur fuer SERVICE_RISK gesetzt - der bereits von core/operational-
  // priority.ts berechnete priorityScore, unveraendert durchgereicht (siehe
  // Architekturentscheidung "keine neue uebergreifende Bewertung" im
  // Abschlussbericht).
  priorityScore: number | null;
}

export interface AttentionList {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  items: AttentionItem[];
  // Anzahl offener Incidents, die NICHT als eigener Eintrag erscheinen,
  // weil sie bereits einem der zurueckgegebenen PROBLEM-Eintraege
  // zugeordnet sind (Phase 35 problem_incidents-Verknuepfung) - macht die
  // Rauschunterdrueckung transparent, statt sie stillschweigend zu tun.
  suppressedDuplicateIncidentCount: number;
}
