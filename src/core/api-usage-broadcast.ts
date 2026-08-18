import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { countOrganizationRequestsToday } from "../db/api-key-usage.repository";

// Phase 16 (2. Iteration) Auftragspunkt 9 "Realtime" (API_USAGE_UPDATED) -
// bewusst gedrosselt statt pro einzelnem /api/v1-Request zu broadcasten
// (das waere bei realem Traffic reiner Spam, siehe bereits dokumentierte
// Entscheidung in realtime/events.ts). Hoechstens einmal alle 5 Sekunden
// PRO ORGANISATION - haeufig genug fuer ein "live" wirkendes Usage-Tab,
// selten genug um keine Broadcast-Flut zu erzeugen. In-Memory (wie die
// Presence-Map in websocket.server.ts) - bei mehreren Backend-Instanzen
// wuerde jede Instanz unabhaengig drosseln, was fuer eine reine UI-
// Aktualisierungshilfe (keine sicherheitsrelevante Garantie) ausreichend ist.
const THROTTLE_MS = 5_000;
const lastBroadcastAtByOrg = new Map<string, number>();

export async function notifyUsageUpdated(organizationId: string): Promise<void> {
  const now = Date.now();
  const last = lastBroadcastAtByOrg.get(organizationId) ?? 0;
  if (now - last < THROTTLE_MS) {
    return;
  }
  lastBroadcastAtByOrg.set(organizationId, now);

  const requestsToday = await countOrganizationRequestsToday(organizationId);
  broadcast(createEvent(RealtimeEventType.API_USAGE_UPDATED, { organizationId, requestsToday }));
}
