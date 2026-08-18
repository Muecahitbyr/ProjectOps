// CHECK_WARNING/CHECK_ERROR/CHECK_OFFLINE/AI_ANALYSIS_CREATED sind bewusst nur
// als Typen vorbereitet (Datenmodell), werden aber aktuell noch nicht von
// getRecentEvents() erzeugt - ein Event pro einzelnem Check-Lauf wuerde bei
// anhaltenden Ausfaellen zu Spam fuehren, waehrend Incidents bereits
// dedupliziert sind. Die tatsaechliche Emission ist ein spaeterer Schritt.
export enum DashboardEventType {
  CHECK_WARNING = "CHECK_WARNING",
  CHECK_ERROR = "CHECK_ERROR",
  CHECK_OFFLINE = "CHECK_OFFLINE",
  INCIDENT_OPENED = "INCIDENT_OPENED",
  INCIDENT_RESOLVED = "INCIDENT_RESOLVED",
  AI_ANALYSIS_CREATED = "AI_ANALYSIS_CREATED",
}

// Wire-Format fuer die API-Ausgabe: lowercase-Variante der Enum-Werte
// (z.B. "incident_opened"). Intern (SQL, Klassifizierung) wird ausschliesslich
// DashboardEventType (GROSS) verwendet - die Konvertierung passiert einmalig
// beim Aufbau der HTTP-Antwort in dashboard.repository.ts.
export type DashboardEventTypeWire = Lowercase<`${DashboardEventType}`>;
