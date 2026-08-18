export type ProjectType = "mobile-app" | "website" | "api";

export type CheckType =
  | "http"
  | "ssl"
  | "dns"
  | "response-time"
  | "firebase-status"
  | "firestore"
  | "firebase-storage"
  | "stripe"
  // Phase 53 "Multi-Project Production Monitoring Integration" - oeffentliche,
  // unauthenticated Status-/Daten-Endpunkte, die keine HTTP-Statuscode-basierte
  // ONLINE/ERROR-Auswertung erlauben (Stripe: Status steckt im JSON-Body, nicht
  // im HTTP-Status; countriesnow.space: 200 allein beweist noch keine gueltigen
  // Daten - siehe stripe-status.check.ts/countriesnow.check.ts).
  | "stripe-status"
  | "countriesnow"
  | "api-health"
  | "custom";

export interface CheckThresholds {
  // Einheit ist je Check-Typ unterschiedlich: ms bei response-time, Tage bei ssl.
  warning?: number;
  critical?: number;
}

// Phase 53 - fuer produktive Cloud Functions/APIs, die absichtlich mit einem
// Nicht-2xx-Status auf unauthenticated Requests antworten (z.B. 401 ohne
// Firebase-ID-Token, 400 ohne gueltige Stripe-Signatur). Ein Treffer beweist
// NUR Erreichbarkeit ("die Funktion existiert und antwortet"), nicht
// vollstaendige fachliche Korrektheit - siehe api-health.check.ts.
export type ExpectedStatusConfig = number[];

export type GtccBusinessMetric = "gtcc-lobbies";

export interface CheckConfig {
  id: string;
  type: CheckType;
  target?: string;
  intervalMinutes: number;
  enabled: boolean;
  thresholds?: CheckThresholds;
  expectedStatusCodes?: ExpectedStatusConfig;
  expectedContentType?: string;
  // Phase 53 - zweckgebundenes Business-Metric-Flag statt einer generischen
  // Query-DSL (siehe firestore.check.ts) - bewusst kein neues Subsystem.
  businessMetric?: GtccBusinessMetric;
}

// Phase 55 "Vollstaendige Projekt-Informationsintegration" - strukturierte,
// maschinenlesbare Projekt-Identitaet/-Architektur aus den bereits
// vorliegenden Project Discovery Reports, zusaetzlich zu den bereits ueber
// checks[] abgebildeten Fakten (Firebase-Projekt-ID steckt z.B. bereits in
// checks[].target - hier bewusst NICHT redundant wiederholt). Wird ueber
// denselben, bereits bestehenden Mechanismus wie der Rest von ProjectConfig
// persistiert: projects.config (JSONB), befuellt durch syncProjects()
// (db/projects.repository.ts) bei jedem Serverstart/ RELOAD_CONFIGURATION -
// keine neue Tabelle, keine neue Engine. Alle Felder optional und nur mit
// tatsaechlich im jeweiligen Discovery Report genannten Fakten befuellt,
// niemals geschaetzt.
export interface ProjectTechProfile {
  // z.B. "Native iOS App", "Website"
  platform?: string;
  // z.B. "de.mbdevelopment.driveconnect" (DriveConnect)
  bundleId?: string;
  // z.B. "europe-west1" (Rechno Cloud Functions)
  firebaseRegion?: string;
  // reale, im Discovery Report genannte Firestore-Collections/-Pfade, z.B.
  // ["users", "users/{uid}/cars", "runs", "feedback"] (DriveConnect)
  firestoreCollections?: string[];
  // reale, im Discovery Report genannte Business Signals - auch solche, die
  // (noch) nicht technisch umsetzbar sind (z.B. mangels Credential oder weil
  // sie eine authentifizierte Anfrage erfordern wuerden) - die Information
  // soll nicht verloren gehen, nur weil sie aktuell nicht messbar ist.
  businessSignals?: string[];
  // Phase 55 Reconciliation - bekannte, im Discovery Report dokumentierte
  // betriebliche Fakten/Einschraenkungen, die keinem der obigen
  // strukturierten Felder eindeutig zuzuordnen sind (z.B. ein bekanntes
  // Fehlen automatisierter Wartung/Cleanup fuer ablaufende Daten). Bewusst
  // generisch benannt (nicht GTCC-spezifisch) und freitextbasiert, damit
  // spaetere, aehnlich gelagerte Fakten bei anderen Projekten dasselbe Feld
  // wiederverwenden koennen, statt fuer jeden Einzelfall ein neues Feld zu
  // erfinden. Rein deskriptiv - loest selbst keine Logik aus.
  operationalNotes?: string[];
}

export interface ProjectConfig {
  id: string;
  name: string;
  type: ProjectType;
  description?: string;
  checks: CheckConfig[];
  techProfile?: ProjectTechProfile;
}
