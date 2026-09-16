import { logger } from "./logger";
import type { ScrapedLead } from "../types/customer-finder.types";

// "Kunden Finden" - Client fuer den externen Google-Maps-Scraper
// (gosom/google-maps-scraper, Docker-Image "gosom/google-maps-scraper",
// laeuft als eigener Service "scraper" im projectops-Docker-Netzwerk, siehe
// docker-compose.production.yml). Lokal (ohne den Compose-Service) zeigt
// der Default auf das separate lokale Scraper-Repo des Nutzers auf
// localhost:8080 (dessen eigene docker-compose.yml, siehe dortiges
// .env.example: "SCRAPER_BASE_URL=http://localhost:8080").
const SCRAPER_BASE_URL = process.env.SCRAPER_BASE_URL ?? "http://localhost:8080";

// Scraper-API-Konstanten (siehe .claude/skills/google-maps-scraper/SKILL.md
// im Kit-Repo, verifiziert gegen den Go-Quellcode von gosom/google-maps-scraper
// web/job.go + web/web.go): depth 5 = Nutzerempfehlung fuer den Start
// ("start at depth 5"), max_time in SEKUNDEN (die API multipliziert intern
// mit time.Second), email:true ist im Kit bewusst Standard (Emails sind das
// wichtigste Lead-Feld).
const SCRAPER_LANG = "de";
const SCRAPER_ZOOM = 15;
const SCRAPER_RADIUS_METERS = 10_000;
const SCRAPER_DEPTH = 5;
const SCRAPER_MAX_TIME_SECONDS = 300;

export type ScraperJobStatus = "pending" | "working" | "ok" | "failed";

interface GeocodeResult {
  lat: string;
  lon: string;
}

// Stadt -> Koordinaten ueber OpenStreetMap Nominatim (kostenlos, kein API-
// Key) - der Scraper selbst nimmt nur lat/lon, keine Ortsnamen. Genau das
// Verfahren, das scripts/scrape.py im Kit-Repo fuer "--city" nutzt. Kein
// User-Agent mit persoenlichen Daten - Nominatim verlangt lediglich einen
// identifizierenden Header, keinen Klarnamen/keine Kontaktadresse.
export async function geocodeCity(city: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: "json", limit: "1", q: city })}`;
  const response = await fetch(url, { headers: { "User-Agent": "ProjectOps-CustomerFinder/1.0" } });
  if (!response.ok) {
    logger.warn("Geocoding fehlgeschlagen", { city, statusCode: response.status });
    return null;
  }
  const hits = (await response.json()) as Array<{ lat: string; lon: string }>;
  if (hits.length === 0) return null;
  return { lat: hits[0]!.lat, lon: hits[0]!.lon };
}

interface CreateScraperJobParams {
  keywords: string;
  lat: string;
  lon: string;
  // Email-Extraktion besucht pro Treffer dessen Website - das kostet den
  // mit Abstand meisten Job-Zeit. Bei "Nur ohne Website" ist das reine
  // Verschwendung: Treffer ohne Website haben nichts zu besuchen, und
  // Treffer MIT Website werden von diesem Filter sowieso verworfen (siehe
  // extractLeadRows()) - deren Emails wuerden also fuer nichts geladen.
  // Der Aufrufer (customer-finder.routes.ts) setzt dies daher auf
  // !filterNoWebsite.
  email: boolean;
}

// Erstellt den Job beim Scraper - gibt dessen UUID zurueck (Antwort ist
// {"id":"<uuid>"}, siehe SKILL.md).
export async function createScraperJob(params: CreateScraperJobParams): Promise<string> {
  const response = await fetch(`${SCRAPER_BASE_URL}/api/v1/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `kunden-finden-${Date.now()}`,
      keywords: [params.keywords],
      lang: SCRAPER_LANG,
      zoom: SCRAPER_ZOOM,
      lat: params.lat,
      lon: params.lon,
      fast_mode: false,
      radius: SCRAPER_RADIUS_METERS,
      depth: SCRAPER_DEPTH,
      email: params.email,
      max_time: SCRAPER_MAX_TIME_SECONDS,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Scraper-Job-Erstellung fehlgeschlagen (${response.status}): ${body}`);
  }
  const data = (await response.json()) as { id: string };
  return data.id;
}

// Feld heisst beim Scraper "Status" mit Grossbuchstaben (kein JSON-Tag im
// Go-Struct, siehe web/job.go) - bewusst so uebernommen, nicht "korrigiert".
export async function getScraperJobStatus(scraperJobId: string): Promise<ScraperJobStatus> {
  const response = await fetch(`${SCRAPER_BASE_URL}/api/v1/jobs/${scraperJobId}`);
  if (!response.ok) {
    throw new Error(`Scraper-Job-Status-Abfrage fehlgeschlagen (${response.status})`);
  }
  const data = (await response.json()) as { Status: ScraperJobStatus };
  return data.Status;
}

export async function downloadScraperResultsCsv(scraperJobId: string): Promise<string> {
  const response = await fetch(`${SCRAPER_BASE_URL}/api/v1/jobs/${scraperJobId}/download`);
  if (!response.ok) {
    throw new Error(`Scraper-CSV-Download fehlgeschlagen (${response.status})`);
  }
  return response.text();
}

// Minimaler RFC4180-CSV-Parser (kein Package fuer diesen einen Anwendungsfall
// - der Scraper liefert Standard-CSV mit ggf. in Anfuehrungszeichen
// gequoteten Feldern, die selbst Kommas/Zeilenumbrueche enthalten koennen,
// z.B. Adressen). Gibt eine Matrix aus Zeilen/Spalten zurueck.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // ignorieren, \n unten schliesst die Zeile ab
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

function parseNumber(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullable(value: string | undefined): string | null {
  return value && value.trim() !== "" ? value : null;
}

export interface CustomerFinderFilters {
  noWebsite: boolean;
  maxReviewCount: number | null;
}

// Reduziert die vollen 34 Scraper-Spalten (siehe SKILL.md) auf die
// tatsaechlich fuer Kundenakquise nutzbaren Lead-Felder und wendet die im
// Suchformular gewaehlten Filter direkt beim Import an - ungefilterte
// Rohdaten landen nie in customer_finder_results.
export function extractLeadRows(csvText: string, filters: CustomerFinderFilters): ScrapedLead[] {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return [];

  const header = rows[0]!;
  const indexOf = (column: string): number => header.indexOf(column);
  const titleIdx = indexOf("title");
  const phoneIdx = indexOf("phone");
  const emailsIdx = indexOf("emails");
  const websiteIdx = indexOf("website");
  const categoryIdx = indexOf("category");
  const addressIdx = indexOf("address");
  const ratingIdx = indexOf("review_rating");
  const reviewCountIdx = indexOf("review_count");
  const openHoursIdx = indexOf("open_hours");

  const leads: ScrapedLead[] = [];
  for (const row of rows.slice(1)) {
    const name = row[titleIdx];
    if (!name) continue;

    const website = toNullable(row[websiteIdx]);
    const reviewCount = parseNumber(row[reviewCountIdx]);

    if (filters.noWebsite && website !== null) continue;
    if (filters.maxReviewCount !== null && (reviewCount ?? 0) >= filters.maxReviewCount) continue;

    leads.push({
      name,
      phone: toNullable(row[phoneIdx]),
      email: toNullable(row[emailsIdx]),
      website,
      category: toNullable(row[categoryIdx]),
      address: toNullable(row[addressIdx]),
      rating: parseNumber(row[ratingIdx]),
      reviewCount,
      openingHours: toNullable(row[openHoursIdx]),
    });
  }
  return leads;
}
