import { Router } from "express";
import { z } from "zod";
import {
  createCustomerFinderJob,
  createCustomerFinderResults,
  deleteCustomerFinderResult,
  getCustomerFinderResultById,
  listCustomerFinderJobs,
  listCustomerFinderResults,
  updateCustomerFinderJob,
} from "../db/customer-finder.repository";
import { createAcquisitionCompany, updateAcquisitionCompany } from "../db/acquisition.repository";
import { authenticate } from "../middleware/authenticate";
import { notFoundError } from "../core/app-error";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { extractLeadRows, geocodeCity, runScraperSearch } from "../core/customer-finder-scraper";
import { logger } from "../core/logger";

// "Kunden Finden" (eigene Sidebar-Seite, Nutzerwunsch) - dieselbe "Shared
// Ops Console"-Konvention wie /todos, /acquisition-companies, /nisan-guests:
// kein projektbezogenes RBAC, jeder angemeldete Nutzer dieses internen
// Einzelbetreiber-Tools sieht/verwaltet alle Eintraege.
export const customerFinderRouter = Router();

function parseResultId(req: import("express").Request): number | undefined {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : undefined;
}

customerFinderRouter.get("/customer-finder/jobs", authenticate, async (_req, res) => {
  res.json(await listCustomerFinderJobs());
});

const createJobSchema = z
  .object({
    keywords: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(200),
    filterNoWebsite: z.boolean().optional(),
    filterMaxReviewCount: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

customerFinderRouter.post("/customer-finder/jobs", authenticate, async (req, res) => {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  // Job-Zeile IMMER zuerst anlegen (auch bevor Geocoding/Suche versucht wird) -
  // sonst verschwindet ein Fehlversuch spurlos statt als FAILED mit Grund
  // sichtbar zu sein (Nutzerwunsch, siehe auch Frontend-Fehleranzeige in
  // CustomerFinder.tsx).
  let job = await createCustomerFinderJob(parsed.data);

  // Fast Mode des Scrapers antwortet in wenigen Sekunden - die Suche laeuft
  // daher synchron im Request, der Job ist bei der Antwort bereits DONE/
  // FAILED (kein Polling-Loop mehr noetig, siehe customer-finder-scraper.ts).
  const startedAt = Date.now();
  try {
    const geo = await geocodeCity(parsed.data.city);
    const geocodedAt = Date.now();
    if (!geo) {
      throw new Error("Stadt konnte nicht gefunden werden");
    }
    const csv = await runScraperSearch({
      keywords: `${parsed.data.keywords} in ${parsed.data.city}`,
      lat: geo.lat,
      lon: geo.lon,
    });
    const scrapedAt = Date.now();
    const leads = extractLeadRows(csv, {
      noWebsite: parsed.data.filterNoWebsite ?? false,
      maxReviewCount: parsed.data.filterMaxReviewCount ?? null,
    });
    await createCustomerFinderResults(job.id, leads);
    const done = await updateCustomerFinderJob(job.id, { status: "DONE", resultCount: leads.length });
    if (done) job = done;
    if (leads.length > 0) broadcast(createEvent(RealtimeEventType.CUSTOMER_FINDER_RESULT_ADDED, { jobId: job.id }));
    // Zeitaufteilung, damit sich Langsamkeit im Log einer Phase zuordnen laesst.
    logger.info("Kunden-Finden-Suche abgeschlossen", {
      jobId: job.id,
      resultCount: leads.length,
      geocodeMs: geocodedAt - startedAt,
      scraperMs: scrapedAt - geocodedAt,
      totalMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    logger.error("Kunden-Finden-Suche fehlgeschlagen", { jobId: job.id, error: message });
    const failed = await updateCustomerFinderJob(job.id, { status: "FAILED", errorMessage: message });
    if (failed) job = failed;
  }

  broadcast(createEvent(RealtimeEventType.CUSTOMER_FINDER_JOB_STATUS_CHANGED, job));
  res.status(201).json(job);
});

customerFinderRouter.get("/customer-finder/results", authenticate, async (_req, res) => {
  res.json(await listCustomerFinderResults());
});

// Haken: Ergebnis wird nach acquisition_companies uebertragen (analog zum
// bestehenden "Hinzufuegen"-Flow in Acquisition.tsx, aber mit
// websiteBuilt:true - Nutzerwunsch, dieser Schritt gilt fuer importierte
// Leads als bereits erledigt) und danach aus customer_finder_results
// GELOESCHT, nicht nur markiert.
customerFinderRouter.post("/customer-finder/results/:id/accept", authenticate, async (req, res) => {
  const id = parseResultId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Ergebnis-ID" });
    return;
  }
  const result = await getCustomerFinderResultById(id);
  if (!result) {
    throw notFoundError("Ergebnis nicht gefunden");
  }

  // Kontaktdaten (Telefon/Email/Website/Branche/Adresse) mitnehmen statt
  // nur den Namen - sonst waeren sie nach der Uebernahme verloren und man
  // koennte die Firma aus der Akquise-Seite heraus gar nicht anrufen
  // (echter, live gefundener Bug/Luecke, siehe Nutzerfeedback 2026-09-16).
  let company = await createAcquisitionCompany({
    name: result.name,
    ...(result.phone ? { phone: result.phone } : {}),
    ...(result.email ? { email: result.email } : {}),
    ...(result.website ? { websiteUrl: result.website } : {}),
    ...(result.category ? { category: result.category } : {}),
    ...(result.address ? { address: result.address } : {}),
    ...(result.openingHours ? { openingHours: result.openingHours } : {}),
  });
  const updated = await updateAcquisitionCompany(company.id, { websiteBuilt: true });
  if (updated) company = updated;

  await deleteCustomerFinderResult(id);

  broadcast(createEvent(RealtimeEventType.ACQUISITION_COMPANY_UPDATED, company));
  broadcast(createEvent(RealtimeEventType.CUSTOMER_FINDER_RESULT_ADDED, { jobId: result.jobId ?? 0 }));
  res.status(200).json(company);
});

// Kreuz: Ergebnis wird einfach geloescht, keine weitere Aktion.
customerFinderRouter.delete("/customer-finder/results/:id", authenticate, async (req, res) => {
  const id = parseResultId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Ergebnis-ID" });
    return;
  }
  const result = await deleteCustomerFinderResult(id);
  if (!result) {
    throw notFoundError("Ergebnis nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.CUSTOMER_FINDER_RESULT_ADDED, { jobId: result.jobId ?? 0 }));
  res.status(204).end();
});
