import { Router } from "express";
import { z } from "zod";
import {
  createCustomerFinderJob,
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
import { createScraperJob, geocodeCity } from "../core/customer-finder-scraper";

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

  // Job-Zeile IMMER zuerst anlegen (auch bevor Geocoding/Scraper-Aufruf
  // versucht wird) - sonst verschwindet ein Fehlversuch spurlos statt als
  // FAILED mit Grund sichtbar zu sein (Nutzerwunsch, siehe auch Frontend-
  // Fehleranzeige in CustomerFinder.tsx).
  let job = await createCustomerFinderJob(parsed.data);

  const geo = await geocodeCity(parsed.data.city);
  if (!geo) {
    const failed = await updateCustomerFinderJob(job.id, { status: "FAILED", errorMessage: "Stadt konnte nicht gefunden werden" });
    if (failed) job = failed;
    broadcast(createEvent(RealtimeEventType.CUSTOMER_FINDER_JOB_STATUS_CHANGED, job));
    res.status(201).json(job);
    return;
  }

  try {
    const scraperJobId = await createScraperJob({
      keywords: `${parsed.data.keywords} in ${parsed.data.city}`,
      lat: geo.lat,
      lon: geo.lon,
      // Bei "Nur ohne Website" ist Email-Extraktion reine Verschwendung
      // (siehe Kommentar in customer-finder-scraper.ts) - deutlich
      // schnellerer Job.
      email: !parsed.data.filterNoWebsite,
    });
    const updated = await updateCustomerFinderJob(job.id, { scraperJobId, status: "WORKING" });
    if (updated) job = updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
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

  let company = await createAcquisitionCompany({ name: result.name });
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
