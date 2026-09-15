import { logger } from "./logger";
import { listActiveCustomerFinderJobs, updateCustomerFinderJob, createCustomerFinderResults } from "../db/customer-finder.repository";
import { downloadScraperResultsCsv, extractLeadRows, getScraperJobStatus } from "./customer-finder-scraper";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import type { CustomerFinderJob } from "../types/customer-finder.types";

// "Kunden Finden" - Polling-Loop fuer laufende Scraper-Jobs, analog zum
// setInterval-Pattern in todo-digest.ts. Der Scraper hat keine Webhooks
// (reine Poll-API, siehe SKILL.md des Kits) - das Backend fragt daher
// periodisch alle Jobs mit Status WORKING ab, statt dass das Frontend
// direkt beim Scraper pollt (haelt den Scraper unerreichbar von aussen,
// siehe docker-compose.production.yml: kein Port-Publishing).
//
// Zustandsuebergaenge leben in der DB (nicht nur im Prozessspeicher) -
// ueberlebt daher einen Backend-Neustart waehrend ein Job laeuft (der naechste
// Tick findet den Job weiterhin mit Status WORKING und pollt einfach weiter).
const POLL_INTERVAL_MS = 10_000;
// Deutlich groesserer Puffer als der Scraper-eigene max_time (siehe
// customer-finder-scraper.ts) - max_time ist beim Scraper offenbar keine
// harte Deadline, sondern wird erst nach Abschluss der aktuell laufenden
// Aufgabe geprueft. Mit email:true (Standard, siehe dort) braucht das
// Abklappern der Firmenwebsites pro Ergebnis zusaetzliche Zeit, die ueber
// max_time hinausgehen kann, ohne dass der Job wirklich haengt (live
// beobachtet: ein Job lief >6 Minuten trotz max_time=300s weiter und war
// nicht haengengeblieben). Der Puffer muss daher grosszuegig sein, sonst
// markiert der Poller echte, noch laufende Jobs faelschlich als FAILED.
const JOB_TIMEOUT_MS = 300_000 + 600_000;

let intervalHandle: ReturnType<typeof setInterval> | undefined;

async function processJob(job: CustomerFinderJob): Promise<void> {
  if (!job.scraperJobId) return;

  if (Date.now() - new Date(job.createdAt).getTime() > JOB_TIMEOUT_MS) {
    const failed = await updateCustomerFinderJob(job.id, { status: "FAILED", errorMessage: "Timeout" });
    if (failed) broadcast(createEvent(RealtimeEventType.CUSTOMER_FINDER_JOB_STATUS_CHANGED, failed));
    logger.warn("Kunden-Finden-Job: Timeout", { jobId: job.id, scraperJobId: job.scraperJobId });
    return;
  }

  const status = await getScraperJobStatus(job.scraperJobId);

  if (status === "pending" || status === "working") {
    return;
  }

  if (status === "failed") {
    const failed = await updateCustomerFinderJob(job.id, { status: "FAILED", errorMessage: "Scraper-Job fehlgeschlagen" });
    if (failed) broadcast(createEvent(RealtimeEventType.CUSTOMER_FINDER_JOB_STATUS_CHANGED, failed));
    logger.warn("Kunden-Finden-Job fehlgeschlagen", { jobId: job.id, scraperJobId: job.scraperJobId });
    return;
  }

  // status === "ok"
  const csv = await downloadScraperResultsCsv(job.scraperJobId);
  const leads = extractLeadRows(csv, { noWebsite: job.filterNoWebsite, maxReviewCount: job.filterMaxReviewCount });
  await createCustomerFinderResults(job.id, leads);

  const done = await updateCustomerFinderJob(job.id, { status: "DONE", resultCount: leads.length });
  if (done) broadcast(createEvent(RealtimeEventType.CUSTOMER_FINDER_JOB_STATUS_CHANGED, done));
  if (leads.length > 0) broadcast(createEvent(RealtimeEventType.CUSTOMER_FINDER_RESULT_ADDED, { jobId: job.id }));
  logger.info("Kunden-Finden-Job abgeschlossen", { jobId: job.id, resultCount: leads.length });
}

async function tick(): Promise<void> {
  const activeJobs = await listActiveCustomerFinderJobs();
  for (const job of activeJobs) {
    try {
      await processJob(job);
    } catch (err) {
      logger.error("Kunden-Finden-Job-Polling fehlgeschlagen", {
        jobId: job.id,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }
}

export function startCustomerFinderPolling(): void {
  intervalHandle = setInterval(() => void tick(), POLL_INTERVAL_MS);
  logger.info("Kunden-Finden-Polling gestartet", { intervalMs: POLL_INTERVAL_MS });
}

export function stopCustomerFinderPolling(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
}
