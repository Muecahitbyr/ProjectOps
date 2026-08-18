import { REALTIME_EVENT_TYPES, type RealtimeConnectionStatus, type RealtimeEvent } from "../types/realtime.types";

// Ein einziger WebSocket fuer die gesamte App (Modul-Singleton statt
// Provider-Komponente) - useRealtime() kann von PageContainer auf jeder
// Seite aufgerufen werden, ohne mehrere Verbindungen zu oeffnen. Verbindet
// sich automatisch beim ersten Import und haelt die Verbindung fuer die
// Lebensdauer der Seite aufrecht.
const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const RECONNECT_JITTER_MS = 300;
// Ab so vielen aufeinanderfolgenden fehlgeschlagenen Versuchen zeigt der
// Status "offline" statt "reconnecting" - die App versucht weiterhin im
// Hintergrund, die Verbindung wiederherzustellen.
const OFFLINE_AFTER_ATTEMPTS = 5;
// App-Level-Heartbeat: der Browser hat keinen JS-Zugriff auf
// WebSocket-Protokoll-Pings, daher schickt der Client periodisch eine eigene
// PING-Nachricht und erwartet eine PONG-Antwort - bleibt sie aus, gilt die
// Verbindung als tot.
const HEARTBEAT_INTERVAL_MS = 20_000;
const HEARTBEAT_TIMEOUT_MS = 8_000;

type StatusListener = (status: RealtimeConnectionStatus) => void;
type EventListener = (event: RealtimeEvent) => void;

let socket: WebSocket | null = null;
let status: RealtimeConnectionStatus = "connecting";
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | undefined;

const statusListeners = new Set<StatusListener>();
const eventListeners = new Set<EventListener>();

// Production (siehe deploy/nginx/reverse-proxy.conf) liefert Frontend und
// Backend unter derselben Origin aus - VITE_API_URL bleibt dort bewusst leer
// (siehe frontend/Dockerfile), damit apiClient.ts relative Pfade nutzt.
// new URL("") wuerde hier werfen, daher Fallback auf window.location (=
// dieselbe Origin, exakt richtig fuer den Reverse-Proxy-Fall). Im
// Development ist VITE_API_URL explizit gesetzt (frontend/.env) und wird
// weiterhin verwendet.
function resolveWebSocketUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  const apiUrl = configured ? new URL(configured) : window.location;
  const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${apiUrl.host}/ws`;
}

function setStatus(next: RealtimeConnectionStatus): void {
  if (status === next) return;
  status = next;
  statusListeners.forEach((listener) => listener(status));
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    "timestamp" in value &&
    "payload" in value &&
    REALTIME_EVENT_TYPES.includes((value as { type: unknown }).type as RealtimeEvent["type"])
  );
}

function clearHeartbeatTimeout(): void {
  if (heartbeatTimeoutTimer !== undefined) {
    clearTimeout(heartbeatTimeoutTimer);
    heartbeatTimeoutTimer = undefined;
  }
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== undefined) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
  clearHeartbeatTimeout();
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "PING" }));
    heartbeatTimeoutTimer = setTimeout(() => {
      // Keine PONG-Antwort innerhalb des Timeouts - Verbindung gilt als tot,
      // schliessen loest den regulaeren Reconnect-Pfad ueber onclose aus.
      socket?.close();
    }, HEARTBEAT_TIMEOUT_MS);
  }, HEARTBEAT_INTERVAL_MS);
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

function scheduleReconnect(): void {
  reconnectAttempts += 1;
  setStatus(reconnectAttempts >= OFFLINE_AFTER_ATTEMPTS ? "offline" : "reconnecting");

  const exponentialDelay = BASE_RECONNECT_DELAY_MS * 2 ** (reconnectAttempts - 1);
  const delay = Math.min(exponentialDelay, MAX_RECONNECT_DELAY_MS) + Math.random() * RECONNECT_JITTER_MS;

  clearReconnectTimer();
  reconnectTimer = setTimeout(connect, delay);
}

function connect(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  clearReconnectTimer();
  setStatus(reconnectAttempts === 0 ? "connecting" : "reconnecting");

  const ws = new WebSocket(resolveWebSocketUrl());
  socket = ws;

  ws.onopen = () => {
    reconnectAttempts = 0;
    setStatus("connected");
    startHeartbeat();
  };

  ws.onmessage = (message: MessageEvent<string>) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.data);
    } catch {
      return;
    }

    if (parsed !== null && typeof parsed === "object" && (parsed as { type?: unknown }).type === "PONG") {
      clearHeartbeatTimeout();
      return;
    }

    if (isRealtimeEvent(parsed)) {
      eventListeners.forEach((listener) => listener(parsed));
    }
  };

  ws.onclose = () => {
    stopHeartbeat();
    socket = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose folgt danach automatisch und plant den Reconnect - hier nur
    // sicherstellen, dass die Verbindung tatsaechlich beendet wird.
    ws.close();
  };
}

// Phase 10: die Identitaet wird nicht mehr vom Client per IDENTIFY-Nachricht
// behauptet, sondern vom Server beim WS-Handshake aus dem httpOnly
// access_token-Cookie verifiziert (siehe backend realtime/websocket.server.ts).
// Nach Login/Logout (AuthContext.tsx) hat sich dieses Cookie geaendert - die
// bestehende Verbindung kennt aber noch die alte (oder gar keine) Identitaet
// und wuerde sonst erst nach dem naechsten Reconnect-Backoff aktualisiert.
// reconnectRealtime() erzwingt sofort eine neue, cookie-aktuelle Verbindung.
export function reconnectRealtime(): void {
  reconnectAttempts = 0;
  clearReconnectTimer();
  if (socket) {
    const previousSocket = socket;
    socket = null;
    previousSocket.onclose = null;
    previousSocket.close();
  }
  connect();
}

export function getRealtimeStatus(): RealtimeConnectionStatus {
  return status;
}

export function subscribeRealtimeStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function subscribeRealtimeEvents(listener: EventListener): () => void {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

connect();
