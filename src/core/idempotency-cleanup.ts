import { deleteExpiredIdempotencyKeys } from "../db/api-idempotency.repository";
import { logger } from "./logger";

// Phase 17 Auftragspunkt 20 "Performance" - "kein aggressiver
// Hintergrund-Poller nur fuer Cleanup": laeuft im bestehenden Scheduler-
// Tick (core/monitor.ts, alle ~30s), aber intern auf hoechstens 1x/Stunde
// gedrosselt - eine DELETE-Abfrage alle 30s waere fuer eine Tabelle mit
// 24h-TTL unnoetig haeufig.
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let lastCleanupAt = 0;

export async function cleanupExpiredIdempotencyKeysIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanupAt = now;

  const deleted = await deleteExpiredIdempotencyKeys();
  if (deleted > 0) {
    logger.info("Abgelaufene Idempotency-Keys bereinigt", { deleted });
  }
}
