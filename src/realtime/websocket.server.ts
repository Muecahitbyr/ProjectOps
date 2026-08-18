import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "http";
import { logger } from "../core/logger";
import { allowedOrigins } from "../config/cors.config";
import { createEvent, RealtimeEventType, type RealtimeEvent } from "./events";
import { verifyAccessToken } from "../auth/tokens";
import { ACCESS_TOKEN_COOKIE } from "../config/auth.config";

const WEBSOCKET_PATH = "/ws";
// Etwas ueber dem ueblichen Load-Balancer/Proxy-Idle-Timeout (meist 60s) -
// erkennt tote Verbindungen (z.B. Laptop schlaeft ein), ohne bei kurzen
// Netzwerk-Hicksern faelschlicherweise zu trennen.
const HEARTBEAT_INTERVAL_MS = 30_000;

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
  userId?: string;
}

interface AuthenticatedIncomingMessage extends IncomingMessage {
  authenticatedUserId?: string;
}

let wss: WebSocketServer | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;

// Live-Praesenz pro Benutzer: "Online" bedeutet hier wirklich "hat aktuell
// mindestens eine offene WebSocket-Verbindung" - kein persistierter,
// erfundener Status. lastActiveAt lebt bewusst nur im Speicher (nicht in der
// users-Tabelle, deren Felder im Auftrag explizit aufgezaehlt sind) und geht
// bei einem Backend-Neustart verloren - siehe Abschlussbericht.
//
// Auftragspunkt 12 "Frontend Security" / Sicherheitsluecke aus Phase 9
// geschlossen: die Identitaet kommt nicht mehr aus einer vom Client frei
// waehlbaren IDENTIFY-Nachricht, sondern wird beim WS-Handshake serverseitig
// aus dem httpOnly access_token-Cookie verifiziert (siehe verifyClient
// unten) - ein Client kann sich nicht mehr als ein anderer Benutzer
// ausgeben.
interface PresenceState {
  connections: Set<TrackedSocket>;
  lastActiveAt: Date;
}

const presenceByUserId = new Map<string, PresenceState>();

function touchPresence(userId: string): PresenceState {
  const existing = presenceByUserId.get(userId);
  if (existing) {
    existing.lastActiveAt = new Date();
    return existing;
  }
  const created: PresenceState = { connections: new Set(), lastActiveAt: new Date() };
  presenceByUserId.set(userId, created);
  return created;
}

export function isUserOnline(userId: string): boolean {
  return (presenceByUserId.get(userId)?.connections.size ?? 0) > 0;
}

export function getUserLastActiveAt(userId: string): string | null {
  return presenceByUserId.get(userId)?.lastActiveAt.toISOString() ?? null;
}

// Nur Verbindungen von bekannten Frontend-Origins zulassen - dieselbe
// Allowlist wie fuer CORS bei den HTTP-Routen (config/cors.config.ts).
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    // Kein Origin-Header (z.B. nicht-Browser-Client) - fuer dieses
    // Monitoring-Tool ohne oeffentliche Exposition tolerierbar.
    return true;
  }
  return allowedOrigins.includes(origin);
}

// Minimaler Cookie-Parser fuer den Upgrade-Request (kein express/cookie-parser
// im Kontext eines rohen http.IncomingMessage verfuegbar) - wir brauchen nur
// den Wert eines einzelnen, bekannten Cookie-Namens.
function extractCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function resolveAuthenticatedUserId(req: IncomingMessage): string | undefined {
  const token = extractCookieValue(req.headers.cookie, ACCESS_TOKEN_COOKIE);
  if (!token) return undefined;
  return verifyAccessToken(token)?.sub;
}

function handleIdentify(ws: TrackedSocket, userId: string): void {
  ws.userId = userId;
  const state = touchPresence(userId);
  const wasOffline = state.connections.size === 0;
  state.connections.add(ws);

  if (wasOffline) {
    broadcast(
      createEvent(RealtimeEventType.USER_ONLINE, { userId, lastActiveAt: state.lastActiveAt.toISOString() }),
    );
  }
}

function handleDisconnect(ws: TrackedSocket): void {
  if (!ws.userId) return;

  const state = presenceByUserId.get(ws.userId);
  if (!state) return;

  state.connections.delete(ws);
  state.lastActiveAt = new Date();

  if (state.connections.size === 0) {
    broadcast(
      createEvent(RealtimeEventType.USER_OFFLINE, {
        userId: ws.userId,
        lastActiveAt: state.lastActiveAt.toISOString(),
      }),
    );
  }
}

export function initRealtimeServer(server: HttpServer): void {
  wss = new WebSocketServer({
    server,
    path: WEBSOCKET_PATH,
    verifyClient: (info, callback) => {
      if (!isOriginAllowed(info.origin)) {
        logger.warn("WebSocket-Verbindung abgelehnt (Origin nicht erlaubt)", { origin: info.origin });
        callback(false, 403, "Origin nicht erlaubt");
        return;
      }

      const userId = resolveAuthenticatedUserId(info.req);
      if (!userId) {
        logger.warn("WebSocket-Verbindung abgelehnt (nicht authentifiziert)");
        callback(false, 401, "Nicht authentifiziert");
        return;
      }

      (info.req as AuthenticatedIncomingMessage).authenticatedUserId = userId;
      callback(true);
    },
  });

  wss.on("connection", (ws: TrackedSocket, request: AuthenticatedIncomingMessage) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    // authenticatedUserId wurde bereits in verifyClient() aus dem
    // access_token-Cookie verifiziert - die Praesenz-Kopplung erfolgt
    // sofort beim Verbindungsaufbau, nicht mehr per Client-Nachricht.
    if (request.authenticatedUserId) {
      handleIdentify(ws, request.authenticatedUserId);
    }

    // Einzige vom Client erwartete Nachricht ist der App-Level-Heartbeat
    // (PING, siehe frontend realtimeClient.ts). Alles andere wird ignoriert
    // (insbesondere eine evtl. noch vom alten Frontend gesendete
    // IDENTIFY-Nachricht - die Identitaet steht bereits fest und wird nicht
    // mehr vom Client uebernommen).
    ws.on("message", (raw) => {
      try {
        const message: unknown = JSON.parse(raw.toString());
        if (message === null || typeof message !== "object" || !("type" in message)) {
          return;
        }
        const type = (message as { type: unknown }).type;

        if (type === "PING") {
          ws.send(JSON.stringify({ type: "PONG", timestamp: new Date().toISOString() }));
        }
      } catch {
        // Ungueltige Client-Nachricht - ignorieren, Verbindung bleibt bestehen.
      }
    });

    ws.on("close", () => {
      handleDisconnect(ws);
    });

    ws.on("error", (err) => {
      logger.warn("WebSocket-Client-Fehler", { error: err.message });
    });

    logger.info("WebSocket-Client verbunden", { clients: wss?.clients.size ?? 0 });
  });

  heartbeatTimer = setInterval(() => {
    wss?.clients.forEach((client) => {
      const ws = client as TrackedSocket;
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  logger.info("WebSocket-Server gestartet", { path: WEBSOCKET_PATH });
}

// An allen aktuell verbundenen Clients senden. No-Op, solange kein Client
// verbunden ist (z.B. bevor initRealtimeServer() lief oder ohne Frontend) -
// die Monitoring Engine soll niemals auf Realtime-Zustellung warten muessen.
export function broadcast(event: RealtimeEvent): void {
  if (!wss) return;
  const message = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Phase 13 Teil 11 "Diagnostics Center" - echter Laufzeitzustand des
// WebSocket-Servers, keine erfundene Kennzahl.
export function isRealtimeServerRunning(): boolean {
  return wss !== undefined;
}

export function getConnectedClientCount(): number {
  return wss?.clients.size ?? 0;
}

export function closeRealtimeServer(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
  wss?.close();
  wss = undefined;
}
