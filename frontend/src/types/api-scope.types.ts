// Spiegelt src/types/api-scope.types.ts im Backend. Phase 18 - vor dieser
// Aenderung fehlten alerts:write/automation:read/automation:write/
// automation:execute hier komplett (seit Phase 17), wodurch diese vier
// bereits vom Backend durchgesetzten Scopes im "New API key"-Dialog gar
// nicht auswaehlbar waren - ein echter, waehrend Phase 18 gefundener Bug
// (siehe Abschlussbericht), hiermit behoben.
// Phase 20 "Enterprise API Governance, Developer Portal & Credential
// Lifecycle" ergaenzt zwei Scopes fuer die neue externe Credential-
// Management-API (GET/POST /api/v1/api-keys/...): kein bestehender Scope
// passte fachlich, siehe Backend-Kommentar.
//
// Phase 24 - derselbe Bug wie oben (Phase 18) ist erneut aufgetreten und
// wurde hier live gefunden: incidents:write (Phase 21), slo:read/slo:write
// (Phase 22) und services:read/services:write (Phase 23) waren vom Backend
// laengst real durchgesetzt, fehlten in dieser Datei aber komplett - der
// "New API key"-Dialog (ApiKeysTab.tsx) konnte sie folglich nicht anbieten.
// Mit diesem Sync ergaenzt, plus dem neuen on_call:read (Phase 24).
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
  | "slo:read"
  | "slo:write"
  | "services:read"
  | "services:write"
  | "on_call:read"
  // Phase 27 "Enterprise Deployment Tracking & Change Correlation" -
  // ergaenzt im selben Zug wie das Backend (siehe dortigen Kommentar),
  // um den Phase-18/24-Bug (Scope vom Backend durchgesetzt, hier aber
  // vergessen -> im "New API key"-Dialog nicht waehlbar) nicht zu
  // wiederholen.
  | "deployments:read"
  | "deployments:write"
  // Phase 28 "Enterprise Maintenance Windows, Change Management &
  // Deployment Risk" - derselbe Sync-Schritt wie bei deployments:*
  // (Phase 27) oben, um den Phase-18/24/27-Bug (Scope vom Backend
  // durchgesetzt, hier aber vergessen) nicht zu wiederholen.
  | "changes:read"
  // Phase 39 "Enterprise Resilience External API & Webhook Integration" -
  // derselbe Sync-Schritt wie bei deployments:*/changes:read oben, um den
  // mehrfach dokumentierten Phase-18/24/27/28-Bug (Scope vom Backend
  // durchgesetzt, hier aber vergessen -> im "New API key"-Dialog nicht
  // waehlbar) nicht zu wiederholen.
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

// Phase 18 Auftragspunkt 11 "API Key UI" - kurze, sicherheitsbewusste
// Erklaerung je Scope fuer den "New API key"-Dialog (ApiKeysTab.tsx) und
// die Dokumentation (ApiDocumentationTab.tsx), damit niemand versehentlich
// einen gefaehrlicheren Scope als beabsichtigt aktiviert (insbesondere
// automation:write vs. automation:execute klar unterscheidbar).
export const API_SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  "projects:read": "Read project health, checks, and incident counts.",
  "incidents:read": "Read incidents.",
  "analytics:read": "Read aggregated tenant analytics.",
  "alerts:read": "Read alert rules.",
  "usage:read": "Read this organization's own API usage/quota.",
  "alerts:write": "Create, update, delete, enable/disable alert rules.",
  "automation:read": "Read automation actions, executions, logs, and rules.",
  "automation:write":
    "Create, update, delete automation rules - restricted to a safe action whitelist (health checks, cache/queue/backup maintenance). Restarting a service or container can never be configured this way, even with this scope.",
  "automation:execute": "Execute an automation action that a human has ALREADY approved. Cannot approve actions itself.",
  "api-key-management:read": "List and view other API keys of this organization (never secret values).",
  "api-key-management:write":
    "Create, rotate, and revoke API keys of this organization. A key with this scope can only grant NEW keys scopes it already has itself - it can never create a more powerful sibling key.",
  "incidents:write": "Acknowledge, resolve, and reopen incidents.",
  "slo:read": "Read SLOs and their current SLI/error-budget/burn-rate status.",
  "slo:write": "Create, update, delete SLOs.",
  "services:read": "Read the service catalog, dependencies, and topology graph.",
  "services:write": "Reserved for future use - not yet enforced by any endpoint.",
  "on_call:read": "Read on-call schedules and resolve who is currently on call.",
  "deployments:read": "Read deployment history.",
  "deployments:write": "Record a new deployment - the typical use case is a CI/CD pipeline reporting a deploy it just performed.",
  "changes:read": "Read change records (planned deployments/maintenance work). No write scope - approvals require a human, session-authenticated actor.",
  "resilience:read":
    "Read the resilience overview, per-service resilience detail, and resilience signals (combines health, SLO, incidents, problems, dependencies, and blast radius). No write scope - resilience is fully derived, nothing to write.",
};
