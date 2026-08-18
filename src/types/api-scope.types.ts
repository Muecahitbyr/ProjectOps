import type { OrganizationPlan } from "./organization.types";

// Phase 16 Auftragspunkt 2 "API-Key Scopes" - bewusst nur Scopes, die auch
// tatsaechlich von einem /api/v1-Endpunkt durchgesetzt werden (siehe
// routes/v1/*.routes.ts). "status:read" entfaellt: die Statusseite ist
// bereits oeffentlich ohne Authentifizierung erreichbar (Phase 13,
// /api/status), ein zusaetzlicher gescopeter Endpunkt dafuer waere eine
// Doppelimplementierung.
//
// Phase 17 "Enterprise API Write Platform" ergaenzt vier Scopes:
// alerts:write, automation:read, automation:execute sind real durchgesetzt
// (siehe routes/v1/alerts.routes.ts, routes/v1/automation.routes.ts).
// automation:write war zunaechst (Phase 17) nur reserviert, ohne
// durchsetzenden Endpunkt (Auftragspunkt 10 verbot damals ausdruecklich
// einen Endpunkt mit frei waehlbaren Automation-Action-Parametern). Seit
// Phase 18 wird er real durchgesetzt (POST/PATCH/DELETE /api/v1/automation/
// rules, siehe routes/v1/automation-rules.routes.ts) - beschraenkt auf eine
// serverseitige Aktions-Whitelist, keine frei waehlbaren Parameter.
// Phase 20 "Enterprise API Governance, Developer Portal & Credential
// Lifecycle" Auftragspunkt 13 "Externe API" (Credential-Management) - keiner
// der neun bestehenden Scopes passt fachlich ("kann ANDERE API-Keys lesen/
// erstellen/rotieren/widerrufen" ist keine Teilmenge von z.B. usage:read
// oder automation:write). Zwei neue Scopes, exakt wie im Auftrag
// vorgeschlagen, statt einen bestehenden zweckzuentfremden. Bewusst
// GETRENNT von automation:write o.ae. - Credential-Management ist die
// sicherheitskritischste Kategorie ueberhaupt (ein Key mit diesem Scope
// kann WEITERE Keys erzeugen), daher ein eigener, minimal vergebener Scope
// statt an einen breiteren Scope "angehaengt" zu werden.
// Phase 21 "Enterprise Alerting, Incident Response & Notification
// Orchestration" Auftragspunkt 11 "Incident API" - "falls neue Scopes
// notwendig sind: nur minimal notwendige Scopes hinzufuegen". incidents:read
// existiert bereits; fuer acknowledge/resolve/reopen ueber die externe API
// fehlte ein Schreib-Scope - incidents:write ergaenzt, analog zu
// alerts:write/automation:write (Lese-/Schreib-Trennung ist das etablierte
// Muster fuer jede Ressource in diesem System).
export type ApiScope =
  | "projects:read"
  | "incidents:read"
  | "analytics:read"
  | "alerts:read"
  | "usage:read"
  | "alerts:write"
  | "automation:read"
  | "automation:write"
  | "automation:execute"
  | "api-key-management:read"
  | "api-key-management:write"
  | "incidents:write"
  // Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service
  // Health" Auftragspunkt 12 "API Endpoints" - kein bestehender Scope passt
  // fachlich (SLOs sind eine eigene Ressource, kein Teilaspekt von z.B.
  // alerts:read/analytics:read) - Lese-/Schreib-Trennung wie ueberall sonst.
  | "slo:read"
  | "slo:write"
  // Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
  // Intelligence" Auftragspunkt 18 "Scopes" - kein bestehender Scope passt
  // (Services/Dependencies/Topology sind eine eigene Ressource).
  | "services:read"
  | "services:write"
  // Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" - bewusst
  // NUR ein Lese-Scope: die externe API deckt den realen ChatOps-/
  // Integrations-Anwendungsfall ("wer ist gerade fuer TEAM X dran?", z.B.
  // aus einem Slack-Bot heraus abgefragt) ab. Schedule-/Rotations-/
  // Override-Verwaltung bleibt bewusst der internen, Session-authentifi-
  // zierten Oberflaeche vorbehalten (siehe Abschlussbericht Punkt 5) - kein
  // "on_call:write"-Scope, um keine ungenutzte Angriffsflaeche zu schaffen.
  | "on_call:read"
  // Phase 27 "Enterprise Deployment Tracking & Change Correlation" - eigene
  // Ressource (kein bestehender Scope passt fachlich), Lese-/Schreib-
  // Trennung wie ueberall sonst. deployments:write ist der eigentliche
  // Praxisfall dieser Phase: ein CI/CD-System meldet ueber die externe API
  // reale Deployments (kein UI-Zwang).
  | "deployments:read"
  | "deployments:write"
  // Phase 28 "Enterprise Maintenance Windows, Change Management &
  // Deployment Risk" - bewusst NUR ein Lese-Scope: der externe
  // Anwendungsfall ist Sichtbarkeit ("welche Changes laufen gerade/sind
  // geplant", z.B. fuer ein Status-Dashboard), nicht das Anlegen/Freigeben
  // von Changes ueber die API - der Genehmigungs-Workflow (Auftragspunkt 7)
  // setzt bewusst einen menschlichen, Session-authentifizierten Akteur
  // voraus (analog zu on_call:read, das aus demselben Grund ebenfalls kein
  // Schreib-Gegenstueck hat).
  | "changes:read"
  // Phase 39 "Enterprise Resilience External API & Webhook Integration" -
  // eigene Ressource (kein bestehender Scope passt fachlich - Resilience
  // aggregiert bereits mehrere andere Ressourcen, siehe core/service-
  // resilience.ts). Bewusst NUR ein Lese-Scope, exakt dieselbe Begruendung
  // wie bei on_call:read/changes:read: Resilience ist vollstaendig aus
  // bestehenden Daten ABGELEITET (Phase 37/38) - es gibt fachlich nichts,
  // das ueber diese Ressource direkt "geschrieben" werden koennte.
  | "resilience:read";

export const API_SCOPES: ApiScope[] = [
  "projects:read",
  "incidents:read",
  "analytics:read",
  "alerts:read",
  "usage:read",
  "alerts:write",
  "automation:read",
  "automation:write",
  "automation:execute",
  "api-key-management:read",
  "api-key-management:write",
  "incidents:write",
  "slo:read",
  "slo:write",
  "services:read",
  "services:write",
  "on_call:read",
  "deployments:read",
  "deployments:write",
  "changes:read",
  "resilience:read",
];

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as string[]).includes(value);
}

// Phase 16 "Echte API-Key-Authentifizierung" - eigener, schlanker
// Auth-Context fuer /api/v1 (middleware/api-key-auth.ts), bewusst getrennt
// von der Browser-Session-Identitaet (req.userId, middleware/
// authenticate.ts). Ein API-Key authentifiziert eine Organisation (+
// optional ein Team), nie einen einzelnen Benutzer.
export interface ApiKeyAuthContext {
  authType: "api_key";
  apiKeyId: string;
  organizationId: string;
  teamId: string | null;
  scopes: ApiScope[];
  plan: OrganizationPlan;
  // Phase 19 Auftragspunkt 1 "API Usage Analytics" - der Benutzer, der
  // diesen Key angelegt hat (aus api_keys.created_by, bereits beim
  // Auth-Lookup vorhanden - kein Zusatz-Query). Reine Herkunfts-/
  // Traceability-Info fuer Usage-Events ("userId falls vorhanden"); ein
  // API-Key authentifiziert weiterhin die ORGANISATION pro Request, nicht
  // diesen Benutzer.
  createdByUserId: string | null;
}
