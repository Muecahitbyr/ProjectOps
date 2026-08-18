import { randomBytes, createHash } from "node:crypto";
import type { Request } from "express";
import { AppError } from "./app-error";
import { getMonitoringAgentById, verifyAgentHeartbeatSequence } from "../db/monitoring-agents.repository";
import type { MonitoringAgent } from "../types/monitoring-agent.types";

// Phase 14 Teil 2 "Agent Authentication". Ein Agent Secret ist wie ein
// Refresh-Token (auth/tokens.ts) bereits ein zufaelliger, hochentropischer
// Wert - kein von Menschen gewaehltes Passwort. Nur der SHA-256-Hash wird
// gespeichert (monitoring_agents.agent_secret_hash), niemals das Secret
// selbst - staerker als eine umkehrbare Verschluesselung, da selbst ein
// DB-Kompromiss keine gueltigen Secrets zurueckliefert. Das Secret wird dem
// Agenten genau einmal (bei Registrierung/Rotation) im Klartext gezeigt.
export function generateAgentSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAgentSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

// Replay Protection ohne HMAC-Signierung: der Agent sendet sein Secret als
// Bearer-Credential (TLS schuetzt die Uebertragung, siehe requireTls()
// unten) zusammen mit einer strikt steigenden Sequenznummer. Ein
// wiederholter (abgefangener) Request mit derselben/kleineren Sequenz wird
// serverseitig abgelehnt (verifyAgentHeartbeatSequence prueft und
// aktualisiert die Sequenz atomar). Zusaetzlich ein Zeitstempel-
// Toleranzfenster gegen sehr alte, wiedereingespielte Requests.
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export interface AuthenticatedAgentContext {
  agent: MonitoringAgent;
}

function extractBearerSecret(req: Request): string {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "AGENT_AUTH_REQUIRED", "Kein Agent-Secret im Authorization-Header");
  }
  return header.slice("Bearer ".length).trim();
}

// Auftragspunkt 17 "Sicherheit" / "TLS erzwingen": TLS wird - wie bei allen
// anderen ProjectOps-Endpunkten - am Reverse Proxy terminiert (siehe
// docker-compose.production.yml), der Node-Prozess selbst spricht nur
// HTTP. In Produktion wird daher der von einem TLS-terminierenden Proxy
// gesetzte "x-forwarded-proto"-Header verlangt; in Development (kein
// Proxy vorhanden) wird das nicht erzwungen, um lokale Tests nicht zu
// blockieren.
function requireTls(req: Request): void {
  if (process.env.NODE_ENV !== "production") return;
  if (req.header("x-forwarded-proto") !== "https") {
    throw new AppError(403, "TLS_REQUIRED", "Agent-Kommunikation erfordert HTTPS");
  }
}

export async function authenticateAgentRequest(req: Request): Promise<AuthenticatedAgentContext> {
  requireTls(req);

  const agentId = req.header("x-agent-id");
  const sequenceHeader = req.header("x-agent-sequence");
  const timestampHeader = req.header("x-agent-timestamp");
  if (!agentId || !sequenceHeader || !timestampHeader) {
    throw new AppError(401, "AGENT_AUTH_REQUIRED", "x-agent-id/x-agent-sequence/x-agent-timestamp fehlen");
  }

  const sequence = Number(sequenceHeader);
  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(sequence) || sequence < 0 || !Number.isFinite(timestamp)) {
    throw new AppError(401, "AGENT_AUTH_INVALID", "Ungueltige Sequenz/Zeitstempel");
  }
  if (Math.abs(Date.now() - timestamp) > TIMESTAMP_TOLERANCE_MS) {
    throw new AppError(401, "AGENT_AUTH_STALE", "Zeitstempel ausserhalb des Toleranzfensters (moeglicher Replay)");
  }

  const secret = extractBearerSecret(req);
  const agent = await getMonitoringAgentById(agentId);
  if (!agent || !agent.hasSecret) {
    throw new AppError(401, "AGENT_AUTH_INVALID", "Unbekannter Agent oder kein Secret registriert");
  }
  if (agent.lifecycleStatus === "REVOKED") {
    throw new AppError(403, "AGENT_REVOKED", "Agent-Zugriff wurde widerrufen");
  }

  const secretHash = hashAgentSecret(secret);
  const sequenceAccepted = await verifyAgentHeartbeatSequence(agentId, secretHash, sequence);
  if (!sequenceAccepted) {
    throw new AppError(401, "AGENT_AUTH_INVALID", "Secret ungueltig oder Sequenz nicht steigend (Replay abgelehnt)");
  }

  return { agent };
}
