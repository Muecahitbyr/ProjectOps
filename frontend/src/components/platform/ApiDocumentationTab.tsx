import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import { API_SCOPES, API_SCOPE_DESCRIPTIONS } from "../../types/api-scope.types";

const CODE_SX = {
  fontFamily: "monospace",
  fontSize: "0.85rem",
  backgroundColor: "action.hover",
  p: 1.5,
  borderRadius: 1,
  whiteSpace: "pre-wrap" as const,
  overflowX: "auto" as const,
};

const READ_ENDPOINTS = [
  { method: "GET", path: "/api/v1/projects", scope: "projects:read", paginated: true, description: "List all projects visible to this key (organization/team scoped)." },
  { method: "GET", path: "/api/v1/projects/:id", scope: "projects:read", paginated: false, description: "Get a single project's full health summary." },
  { method: "GET", path: "/api/v1/projects/:id/health", scope: "projects:read", paginated: false, description: "Get just the health/checks sub-object of a project." },
  { method: "GET", path: "/api/v1/incidents", scope: "incidents:read", paginated: true, description: "List incidents (query: resolved)." },
  { method: "GET", path: "/api/v1/incidents/:id", scope: "incidents:read", paginated: false, description: "Get a single incident (derived status, lifecycle timestamps)." },
  { method: "GET", path: "/api/v1/incidents/:id/postmortem", scope: "incidents:read", paginated: false, description: "Get the postmortem for an incident, including action items. 404 if none has been created yet." },
  { method: "GET", path: "/api/v1/incidents/:id/escalation", scope: "incidents:read", paginated: false, description: "Escalation policy status for an incident: current step, resolved on-call responder, and when the next step is due. Empty policy fields if no escalation policy applies." },
  { method: "GET", path: "/api/v1/alerts", scope: "alerts:read", paginated: true, description: "List alert rules for this key's projects." },
  { method: "GET", path: "/api/v1/analytics/summary", scope: "analytics:read", paginated: false, description: "Aggregated tenant analytics (query: hours)." },
  { method: "GET", path: "/api/v1/automation/actions", scope: "automation:read", paginated: true, description: "List automation actions (query: status)." },
  { method: "GET", path: "/api/v1/automation/actions/:id", scope: "automation:read", paginated: false, description: "Get a single automation action." },
  { method: "GET", path: "/api/v1/automation/executions", scope: "automation:read", paginated: true, description: "List automation executions." },
  { method: "GET", path: "/api/v1/automation/executions/:id", scope: "automation:read", paginated: false, description: "Get a single execution." },
  { method: "GET", path: "/api/v1/automation/executions/:id/logs", scope: "automation:read", paginated: true, description: "Log lines for an execution." },
  { method: "GET", path: "/api/v1/automation/rules", scope: "automation:read", paginated: true, description: "List automation rules for this key's projects/team." },
  { method: "GET", path: "/api/v1/automation/rules/:id", scope: "automation:read", paginated: false, description: "Get a single automation rule." },
  { method: "GET", path: "/api/v1/usage/summary", scope: "usage:read", paginated: false, description: "This organization's own API usage analytics." },
  { method: "GET", path: "/api/v1/analytics/api/overview", scope: "usage:read", paginated: false, description: "Requests today/24h/7d, error rate, avg response time, top endpoints/keys - same data as usage/summary, kept as its own path for observability tooling." },
  { method: "GET", path: "/api/v1/analytics/api/timeseries", scope: "usage:read", paginated: false, description: "Time-bucketed requests/errors/avgLatency (query: hours, granularity=hour|day)." },
  { method: "GET", path: "/api/v1/analytics/api/keys/:id", scope: "usage:read", paginated: false, description: "Usage analytics for a single API key of this organization." },
  { method: "GET", path: "/api/v1/api-keys", scope: "api-key-management:read", paginated: true, description: "List other API keys of this organization/team (never secret values)." },
  { method: "GET", path: "/api/v1/api-keys/:id", scope: "api-key-management:read", paginated: false, description: "Get a single API key's metadata and derived status." },
  { method: "GET", path: "/api/v1/health", scope: "none", paginated: false, description: "Verify the key and inspect plan/scopes/quota status." },
  // Phase 22/23 endpoints were missing from this page entirely (real
  // documentation gap found and fixed in Phase 24 - see the Phase 24
  // final report, "Gefundene und behobene Bugs").
  { method: "GET", path: "/api/v1/slo", scope: "slo:read", paginated: true, description: "List SLOs (organization/team scoped) with their latest evaluated status." },
  { method: "GET", path: "/api/v1/slo/:id", scope: "slo:read", paginated: false, description: "Get a single SLO with its latest evaluated status." },
  { method: "GET", path: "/api/v1/slo/:id/status", scope: "slo:read", paginated: false, description: "Get just the current SLI/error-budget/burn-rate status of one SLO." },
  { method: "GET", path: "/api/v1/slo/:id/history", scope: "slo:read", paginated: false, description: "Historical evaluation snapshots (query: window=1h|24h|7d|30d)." },
  { method: "GET", path: "/api/v1/services", scope: "services:read", paginated: true, description: "List catalog services (organization/team scoped)." },
  { method: "GET", path: "/api/v1/services/:id", scope: "services:read", paginated: false, description: "Get a single service." },
  { method: "GET", path: "/api/v1/services/:id/dependencies", scope: "services:read", paginated: true, description: "List a service's outgoing dependencies." },
  // Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis".
  { method: "GET", path: "/api/v1/services/:id/impact", scope: "services:read", paginated: false, description: "Blast-radius analysis: affected services grouped by depth, critical cascade paths, single-point-of-failure candidates, related open incidents/at-risk SLOs/triggered alerts, and a human-readable summary." },
  { method: "GET", path: "/api/v1/topology", scope: "services:read", paginated: false, description: "Full dependency graph for this organization/team (nodes + edges)." },
  // Phase 24 "Enterprise On-Call Scheduling & Escalation Routing".
  { method: "GET", path: "/api/v1/on-call/schedules", scope: "on_call:read", paginated: true, description: "List on-call schedules (organization/team scoped)." },
  { method: "GET", path: "/api/v1/on-call/schedules/:id", scope: "on_call:read", paginated: false, description: "Get a single on-call schedule's rotation configuration." },
  { method: "GET", path: "/api/v1/on-call/schedules/:id/current", scope: "on_call:read", paginated: false, description: "Resolve who is on call for this schedule right now (override-aware)." },
  // Phase 27 "Enterprise Deployment Tracking & Change Correlation".
  { method: "GET", path: "/api/v1/deployments", scope: "deployments:read", paginated: true, description: "List deployments (organization/team scoped; query: projectId, environment, status)." },
  { method: "GET", path: "/api/v1/deployments/:id", scope: "deployments:read", paginated: false, description: "Get a single deployment." },
  // Phase 28 "Enterprise Maintenance Windows, Change Management &
  // Deployment Risk" - bewusst nur lesend (kein changes:write, siehe
  // types/api-scope.types.ts): der Genehmigungs-Workflow setzt einen
  // menschlichen, Session-authentifizierten Akteur voraus.
  { method: "GET", path: "/api/v1/changes", scope: "changes:read", paginated: true, description: "List change records (organization scoped; query: status, risk, changeType)." },
  { method: "GET", path: "/api/v1/changes/:id", scope: "changes:read", paginated: false, description: "Get a single change record, including its assigned service ids." },
  // Phase 39 "Enterprise Resilience External API & Webhook Integration" -
  // bewusst nur lesend (kein resilience:write, siehe types/api-scope.types.ts):
  // Resilience ist vollstaendig aus bestehenden Daten abgeleitet.
  { method: "GET", path: "/api/v1/resilience/overview", scope: "resilience:read", paginated: true, description: "Per-project resilience overview (health/SLO/incidents/problems/dependencies/blast radius combined into one resilienceStatus; query: range=24h|7d|30d|90d)." },
  { method: "GET", path: "/api/v1/resilience/services/:projectId", scope: "resilience:read", paginated: false, description: "Full resilience detail for one project: health, reliability, SLO, problems, dependencies, blast radius, active change risk, remediation effectiveness, and up to 10 resilience signals." },
  { method: "GET", path: "/api/v1/resilience/services/:projectId/signals", scope: "resilience:read", paginated: false, description: "Just the resilience signals array for one project (subset of the detail endpoint above)." },
  // Phase 43 "Enterprise Operational Priority Intelligence" - deterministic
  // ranking + recommended action derived from the overview/detail signals
  // above (query: range=24h|7d|30d|90d, limit=1-100, default 20).
  { method: "GET", path: "/api/v1/resilience/priority-queue", scope: "resilience:read", paginated: false, description: "Org-wide, priority-ranked list of non-healthy projects with a deterministic score, primary reason, recommended action, and confidence (HIGH for current-state signals, MEDIUM for forecast-based ones)." },
];

const WRITE_ENDPOINTS = [
  { method: "POST", path: "/api/v1/alerts", scope: "alerts:write", idempotent: true, description: "Create an alert rule for a project owned by this key's organization." },
  { method: "PATCH", path: "/api/v1/alerts/:id", scope: "alerts:write", idempotent: false, description: "Update an alert rule." },
  { method: "DELETE", path: "/api/v1/alerts/:id", scope: "alerts:write", idempotent: false, description: "Delete an alert rule." },
  { method: "POST", path: "/api/v1/alerts/:id/enable", scope: "alerts:write", idempotent: false, description: "Enable an alert rule." },
  { method: "POST", path: "/api/v1/alerts/:id/disable", scope: "alerts:write", idempotent: false, description: "Disable an alert rule." },
  {
    method: "POST",
    path: "/api/v1/automation/actions/:id/execute",
    scope: "automation:execute",
    idempotent: true,
    description: 'Execute an ALREADY-APPROVED automation action ({ "dryRun": boolean }). Cannot approve actions itself - see "Approval Workflow" below.',
  },
  {
    method: "POST",
    path: "/api/v1/automation/rules",
    scope: "automation:write",
    idempotent: true,
    description: 'Create an automation rule ("action" restricted to a safe whitelist - see "Automation Rules" below). Subject to the automationRulesPerOrganization quota.',
  },
  { method: "PATCH", path: "/api/v1/automation/rules/:id", scope: "automation:write", idempotent: false, description: "Update an automation rule." },
  { method: "DELETE", path: "/api/v1/automation/rules/:id", scope: "automation:write", idempotent: false, description: "Delete an automation rule." },
  {
    method: "POST",
    path: "/api/v1/api-keys",
    scope: "api-key-management:write",
    idempotent: true,
    description: "Create a new API key for this organization/team. Scopes must be a SUBSET of the calling key's own scopes - see \"Credential Management\" below.",
  },
  {
    method: "POST",
    path: "/api/v1/api-keys/:id/rotate",
    scope: "api-key-management:write",
    idempotent: true,
    description: "Issue a new secret for an existing key (same id/scopes/team). The previous secret stops working immediately.",
  },
  { method: "POST", path: "/api/v1/api-keys/:id/revoke", scope: "api-key-management:write", idempotent: false, description: "Permanently revoke an API key. Cannot be undone or reversed." },
  { method: "POST", path: "/api/v1/incidents/:id/acknowledge", scope: "incidents:write", idempotent: false, description: "Acknowledge an incident. Idempotent in effect (a repeat call is a no-op), but not an Idempotency-Key-guarded creation endpoint." },
  { method: "POST", path: "/api/v1/incidents/:id/resolve", scope: "incidents:write", idempotent: false, description: 'Resolve an incident ({ "reason"?: string }).' },
  { method: "POST", path: "/api/v1/incidents/:id/reopen", scope: "incidents:write", idempotent: false, description: "Reopen a previously resolved incident. 409 if a new incident already opened for the same check in the meantime." },
  { method: "POST", path: "/api/v1/slo", scope: "slo:write", idempotent: true, description: "Create an SLO. Subject to the sloPerOrganization quota." },
  { method: "PATCH", path: "/api/v1/slo/:id", scope: "slo:write", idempotent: false, description: "Update an SLO." },
  { method: "DELETE", path: "/api/v1/slo/:id", scope: "slo:write", idempotent: false, description: "Delete an SLO." },
  {
    method: "POST",
    path: "/api/v1/deployments",
    scope: "deployments:write",
    idempotent: true,
    description: 'Record a deployment for a project owned by this key\'s organization (typically called from CI/CD after a deploy finishes). { "projectId", "version", "environment"?, "status"?, "description"?, "deployedAt"? }.',
  },
];

// Muss mit safe-action-runner.ts (AUTO_EXECUTABLE_ACTIONS) uebereinstimmen -
// siehe "Automation Rules"-Sektion unten fuer die Begruendung dieser
// engeren Liste gegenueber der internen Automation Center UI.
const EXTERNALLY_ALLOWED_RULE_ACTIONS = [
  "RUN_HEALTH_CHECK",
  "CREATE_DIAGNOSTIC_SNAPSHOT",
  "COLLECT_LOGS",
  "CLEAR_CACHE",
  "RESTART_MONITOR",
  "RETRY_CHECK",
  "RELOAD_CONFIGURATION",
  "FLUSH_QUEUE",
  "CREATE_BACKUP",
  "VERIFY_DEPENDENCIES",
];

const RULE_TRIGGERS = [
  "INCIDENT_CREATED",
  "INCIDENT_RESOLVED",
  "ALERT_TRIGGERED",
  "ALERT_ESCALATED",
  "PROJECT_CRITICAL",
  "PROJECT_WARNING",
  "CHECK_FAILED",
  "CHECK_RECOVERED",
  "MAINTENANCE_STARTED",
  "MAINTENANCE_ENDED",
  "ROOT_INCIDENT_CREATED",
  "RESILIENCE_DEGRADED",
  "RESILIENCE_RECOVERED",
  "PROACTIVE_RISK_DETECTED",
  "PROACTIVE_RISK_CLEARED",
];

const ERROR_CODES = [
  { status: "401", code: "AUTH_REQUIRED", description: "Missing, unknown, revoked, or expired API key." },
  { status: "403", code: "FORBIDDEN", description: 'Valid key, but missing the required scope - or the target automation action is not yet APPROVED/was REJECTED (see "Approval Workflow").' },
  { status: "404", code: "NOT_FOUND", description: "Resource does not exist, or belongs to a different organization/team." },
  { status: "400", code: "VALIDATION_ERROR", description: "Request body failed validation (same rules as the internal UI)." },
  { status: "409", code: "IDEMPOTENCY_KEY_REUSED", description: "The Idempotency-Key was already used with a different request body." },
  {
    status: "409",
    code: "CONFLICT",
    description:
      "Either a request with this Idempotency-Key is still being processed (retry shortly), or a non-time-based organization-wide limit was reached (e.g. automationRulesPerOrganization) - no Retry-After header, since these limits don't reset on a timer.",
  },
  { status: "429", code: "RATE_LIMITED", description: "Per-key rate limit (per minute, tiered by read/write/execute) exceeded." },
  { status: "429", code: "QUOTA_EXCEEDED", description: "Per-organization daily quota (general or automation-execution-specific) exceeded - resets at UTC midnight (see Retry-After header)." },
];

// Phase 16 Auftragspunkt 11 "API Documentation" - bewusst als statische
// React-Seite innerhalb der Platform Administration statt einer separaten
// OpenAPI/Swagger-Integration (Auftrag: "Nicht unnoetig aufblasen", "nur
// dann, wenn es ohne unnoetige Abhaengigkeiten sauber passt" - fuer die
// aktuell 4 Endpunkte lohnt sich der zusaetzliche Dependency-/Build-
// Aufwand einer Swagger-UI nicht). Rate-Limit-/Quota-Werte spiegeln
// config/plan-limits.ts im Backend (dortige Kommentare sind die
// Quelle der Wahrheit, falls die Zahlen dort geaendert werden).
export function ApiDocumentationTab() {
  return (
    <Stack sx={{ gap: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Authentication
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Send your API key in one of these headers on every request:
          </Typography>
          <Box component="pre" sx={CODE_SX}>{`X-API-Key: pok_...\n\n# or, alternatively:\nAuthorization: Bearer pok_...`}</Box>
          <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
            API keys are a separate identity from browser-session logins. They authenticate an Organization (and optionally a Team), never an
            individual user, and never inherit Organization Owner permissions automatically - only the scopes granted at creation time apply.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Base URL &amp; Example Request
          </Typography>
          <Box component="pre" sx={CODE_SX}>{`curl -H "X-API-Key: pok_..." \\\n  https://<your-deployment>/api/v1/projects`}</Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Read Endpoints
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Method</TableCell>
                <TableCell>Path</TableCell>
                <TableCell>Required scope</TableCell>
                <TableCell>Paginated</TableCell>
                <TableCell>Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {READ_ENDPOINTS.map((endpoint) => (
                <TableRow key={endpoint.path}>
                  <TableCell>
                    <Chip size="small" label={endpoint.method} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace" }}>{endpoint.path}</TableCell>
                  <TableCell>{endpoint.scope === "none" ? "—" : <Chip size="small" variant="outlined" label={endpoint.scope} />}</TableCell>
                  <TableCell>{endpoint.paginated ? "Yes" : "—"}</TableCell>
                  <TableCell>{endpoint.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Write Endpoints
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }} color="text.secondary">
            Every mutating request is scoped to this key's organization (and team, if team-bound) - writing to another organization's resources
            always returns 404, never partial success.
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Method</TableCell>
                <TableCell>Path</TableCell>
                <TableCell>Required scope</TableCell>
                <TableCell>Idempotency-Key</TableCell>
                <TableCell>Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {WRITE_ENDPOINTS.map((endpoint) => (
                <TableRow key={`${endpoint.method}-${endpoint.path}`}>
                  <TableCell>
                    <Chip size="small" label={endpoint.method} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace" }}>{endpoint.path}</TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={endpoint.scope} />
                  </TableCell>
                  <TableCell>{endpoint.idempotent ? "Required" : "—"}</TableCell>
                  <TableCell>{endpoint.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Pagination
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            List endpoints (marked "Paginated" above) accept <code>page</code>/<code>pageSize</code> query parameters (pageSize capped at 200,
            default 50) and return a wrapped response instead of a bare array:
          </Typography>
          <Box component="pre" sx={CODE_SX}>{`GET /api/v1/incidents?page=2&pageSize=25\n\n{\n  "data": [ ... ],\n  "pagination": { "page": 2, "pageSize": 25, "total": 143 }\n}`}</Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Idempotency Keys
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Endpoints marked "Required" above need an <code>Idempotency-Key</code> header (any unique string you generate, e.g. a UUID) - this
            guarantees that retrying the exact same request never creates a duplicate side effect:
          </Typography>
          <Box component="pre" sx={CODE_SX}>{`POST /api/v1/alerts\nIdempotency-Key: 6f2a1e3e-...\n\n# Same key + same body again -> the EXACT same response is replayed,\n#   no second alert rule is created.\n# Same key + a DIFFERENT body -> 409 IDEMPOTENCY_KEY_REUSED.\n# A request with this key is still in flight -> 409 CONFLICT, retry shortly.`}</Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Keys are scoped per API key and expire after 24 hours. Reusing a key after the underlying state changed (e.g. after an action gets
            approved) intentionally still replays the original response - use a new key to represent a genuinely new attempt.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Approval Workflow (Automation)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <code>POST /api/v1/automation/actions/:id/execute</code> can only run actions that are already <code>APPROVED</code> through the
            existing internal approval flow (Automation Center, Organization Owner/Admin). An API key can never approve an action itself - there
            is no external approve endpoint. Calling execute on a <code>PROPOSED</code> action returns 403 and does not run anything (a
            realtime <code>API_AUTOMATION_EXECUTION_REQUESTED</code> notice and an audit log entry are recorded); calling it on a{" "}
            <code>REJECTED</code> action also returns 403. Dangerous actions (e.g. restarting a container) are never auto-executable and always
            require this same human approval step, regardless of caller.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Automation Rules
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Rules created through <code>POST /api/v1/automation/rules</code> use the exact same engine and database table as the internal
            Automation Center - there is no separate execution path for API-created rules. The request body is validated strictly (unknown
            fields, e.g. <code>organizationId</code>, <code>approvedBy</code>, <code>executedBy</code>, are rejected with 400 VALIDATION_ERROR,
            never silently ignored) and <code>organizationId</code> is always taken from the authenticated API key - it can never be supplied by
            the caller.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <code>action</code> is restricted to a whitelist that is <strong>narrower</strong> than what the internal UI allows - the same set the
            engine already trusts to run completely unattended (<code>auto_execute</code>), reused here rather than inventing a second list:
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mb: 1 }}>
            {EXTERNALLY_ALLOWED_RULE_ACTIONS.map((action) => (
              <Chip key={action} size="small" label={action} variant="outlined" />
            ))}
          </Stack>
          <Typography variant="body2" sx={{ mb: 1 }} color="text.secondary">
            <code>RESTART_SERVICE</code> and <code>RESTART_CONTAINER</code> can never be configured by an API-created rule, regardless of scope -
            restarting infrastructure always requires a human using the internal Automation Center.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Allowed <code>trigger</code> values:
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mb: 1 }}>
            {RULE_TRIGGERS.map((trigger) => (
              <Chip key={trigger} size="small" label={trigger} variant="outlined" />
            ))}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Tenant isolation applies to every operation: a rule's <code>projectId</code> (and <code>teamId</code>, if set) must belong to this
            key's own organization/team, checked on every GET/PATCH/DELETE by id - a rule belonging to another organization always returns 404,
            never 403, so a key can't distinguish "doesn't exist" from "not yours". Creating rules is additionally capped by the
            <code>automationRulesPerOrganization</code> quota (see "Rate Limits &amp; Quotas" below).
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Credential Management
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            The <code>/api/v1/api-keys</code> endpoints let a key manage <strong>other</strong> API keys of its own organization (and team, if
            team-bound) - the exact same create/rotate/revoke logic as the "Credentials" tab in the Developer Portal, just reachable
            programmatically. A key can even rotate or revoke itself.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>Privilege escalation is not possible:</strong> a key with only <code>api-key-management:write</code> can create new keys, but
            only with scopes that key <em>already has itself</em> - requesting any scope the caller doesn't have returns 403. A key can never
            mint a more powerful sibling key.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The plaintext secret is returned exactly once, on the create/rotate response - it is never stored in plaintext and can never be
            retrieved again afterwards, identical to the internal "New API key" dialog.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Scopes
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Scope</TableCell>
                <TableCell>Grants</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {API_SCOPES.map((scope) => (
                <TableRow key={scope}>
                  <TableCell>
                    <Chip size="small" label={scope} variant="outlined" />
                  </TableCell>
                  <TableCell>{API_SCOPE_DESCRIPTIONS[scope]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
            Assign scopes when creating a key in the "API Keys" tab. A request against an endpoint whose scope the key does not have returns 403.
            A key never inherits Organization Owner rights automatically, and scopes are strictly independent - none of them implies another.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            API Key Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            In the "API Keys" tab: Create (secret shown once), Rotate (issues a new secret for the same key - the old one stops working
            immediately, shown once), Revoke (immediate, irreversible). Rotating and revoking both fire realtime events and audit log entries.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Rate Limits &amp; Quotas
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Rate limits are tiered by risk (read &gt; write &gt; execute) and, together with the daily quotas, derived from the organization's
            plan (FREE / PRO / ENTERPRISE):
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Limit</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell>Behavior</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>Rate limit (read)</TableCell>
                <TableCell>Per API key, per minute</TableCell>
                <TableCell rowSpan={3}>
                  Each tier has its own independent per-minute window per key (a burst on one tier never consumes another tier's budget).
                  Protects against abuse/bursts. Headers: X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset. On 429: code
                  RATE_LIMITED + Retry-After header (seconds).
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Rate limit (write)</TableCell>
                <TableCell>Per API key, per minute - stricter than read</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Rate limit (execute)</TableCell>
                <TableCell>Per API key, per minute - strictest tier</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Daily quota (general)</TableCell>
                <TableCell>Per organization, per calendar day, all requests</TableCell>
                <TableCell>
                  Business plan limit - shared across every API key of the organization (cannot be bypassed by creating more keys). Headers:
                  X-Quota-Limit / X-Quota-Remaining. On 429: code QUOTA_EXCEEDED + Retry-After header (seconds until UTC midnight reset).
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Daily quota (automation execute)</TableCell>
                <TableCell>Per organization, per calendar day</TableCell>
                <TableCell>
                  A SECOND, dedicated cap specifically on <code>POST .../execute</code> calls, on top of the general daily quota - the most
                  sensitive category gets its own explicit ceiling. Same QUOTA_EXCEEDED/Retry-After behavior.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Automation rules (total)</TableCell>
                <TableCell>Per organization, total count across all projects - not time-based</TableCell>
                <TableCell>
                  Caps how many automation rules an organization can have in total (shared across every API key - cannot be bypassed by creating
                  more keys), same idea as the existing API-key/service-account limits. Since it doesn't reset on a timer, exceeding it returns 409
                  CONFLICT with no Retry-After header - delete an existing rule to free up room.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Exact numeric limits per plan are configured centrally on the backend (config/plan-limits.ts) and may change; check the
            X-RateLimit-*/X-Quota-* response headers or GET /api/v1/health for the current values.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Error Codes
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>HTTP Status</TableCell>
                <TableCell>Code</TableCell>
                <TableCell>Meaning</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ERROR_CODES.map((error) => (
                <TableRow key={error.code}>
                  <TableCell>{error.status}</TableCell>
                  <TableCell sx={{ fontFamily: "monospace" }}>{error.code}</TableCell>
                  <TableCell>{error.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Example Response
          </Typography>
          <Box
            component="pre"
            sx={CODE_SX}
          >{`GET /api/v1/health\n\n{\n  "status": "ok",\n  "apiKeyId": "...",\n  "organizationId": "...",\n  "teamId": null,\n  "plan": "PRO",\n  "scopes": ["projects:read", "incidents:read"],\n  "quota": { "requestsToday": 42, "dailyLimit": 20000, "remaining": 19958 },\n  "rateLimit": { "requestsPerMinute": 120 }\n}`}</Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
