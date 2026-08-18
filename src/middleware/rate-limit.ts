import rateLimit from "express-rate-limit";

// Phase 11 Teil 10 "Security" / Phase-10-Abschlussbericht-Empfehlung: schuetzt
// Login/Registrierung vor Brute-Force- bzw. Enumerations-Versuchen. Zaehlung
// pro IP im Prozessspeicher (fuer die aktuelle Single-Instance-Deployment,
// siehe docker-compose.production.yml - bei mehreren Backend-Instanzen
// bräuchte dies einen gemeinsamen Store, z.B. Redis, aktuell nicht Teil der
// Architektur).
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Zu viele Anmeldeversuche - bitte spaeter erneut versuchen", code: "RATE_LIMITED" });
  },
});

export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Zu viele Registrierungsversuche - bitte spaeter erneut versuchen", code: "RATE_LIMITED" });
  },
});

// Phase 13 Teil 3 "Public Status Page" - laeuft explizit VOR authenticate
// (siehe index.ts), daher kein per-User-Limit moeglich. Grosszuegig genug
// fuer legitimes Dashboard-Polling einzelner Besucher, schuetzt aber vor
// Scraping/DoS-Versuchen ueber eine einzelne IP.
export const publicRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Zu viele Anfragen - bitte spaeter erneut versuchen", code: "RATE_LIMITED" });
  },
});

// Phase 14 "Sicherheit" (Auftragspunkt 17: "Rate Limiting" fuer
// Cluster-Aktionen) - Agent-Registrierung und -Heartbeat sind potenzielle
// Ziele fuer Secret-Brute-Force/DoS-Versuche; grosszuegig genug fuer echte
// Heartbeats (alle ~30s pro Agent), schuetzt aber vor exzessiven Versuchen
// von einer einzelnen IP.
export const agentAuthRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Zu viele Agent-Anfragen - bitte spaeter erneut versuchen", code: "RATE_LIMITED" });
  },
});

// Phase 15 "Sicherheit" (Auftragspunkt 14: "Rate Limiting erweitern") -
// POST /api-keys, POST /service-accounts, POST /service-accounts/:id/rotate-secret
// und POST /webhooks erzeugen jeweils ein neues Klartext-Secret (siehe
// core/api-key-auth.ts/core/crypto.ts). Diese Endpunkte sind bereits ueber
// authenticate()+authorizeOrganizationRole() geschuetzt (nur Organization
// Owner/Admin/Security Admin) - dieses Limit ist eine zusaetzliche
// Verteidigungsebene gegen ein kompromittiertes/missbrauchtes Admin-Konto,
// das per Skript massenhaft neue Credentials praegt, analog zu
// agentAuthRateLimiter oben.
export const credentialMintRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Zu viele Credential-Anfragen - bitte spaeter erneut versuchen", code: "RATE_LIMITED" });
  },
});
