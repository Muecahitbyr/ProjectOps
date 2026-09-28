// "Kunden Finden" (eigene Sidebar-Seite, Nutzerwunsch): Integration mit dem
// externen Google-Maps-Scraper (gosom/google-maps-scraper, Fast Mode), siehe
// Backend src/core/customer-finder-scraper.ts.
export type CustomerFinderJobStatus = "PENDING" | "WORKING" | "DONE" | "FAILED";

export interface CustomerFinderJob {
  id: number;
  keywords: string;
  city: string;
  // Wird nicht mehr gesetzt (Suche laeuft synchron im Request) - immer null.
  scraperJobId: string | null;
  status: CustomerFinderJobStatus;
  filterNoWebsite: boolean;
  filterMaxReviewCount: number | null;
  resultCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  // Nur in der direkten Antwort von POST /customer-finder/jobs gefuellt (nicht
  // persistiert, GET /customer-finder/jobs liefert sie nicht) - Anzahl der
  // diesmal gefundenen, aber schon vorhandenen (nicht als "neu" gezaehlten)
  // Treffer. Erklaert im Frontend eine niedrige/0 resultCount trotz echter
  // Treffer (Nutzerfeedback 2026-09-28).
  duplicateCount?: number;
  // Ebenfalls nur in der direkten POST-Antwort: Anzahl der Treffer, die der
  // generische Kategorie-Relevanz-Filter (customer-finder-relevance.ts) als
  // vermutlich branchenfremd verworfen hat (z.B. Friseure bei einer
  // Fahrschule-Suche).
  relevanceRejectedCount?: number;
}

export interface CreateCustomerFinderJobInput {
  keywords: string;
  city: string;
  filterNoWebsite?: boolean;
  filterMaxReviewCount?: number;
}

export interface CustomerFinderResult {
  id: number;
  jobId: number | null;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  category: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  openingHours: string | null;
  createdAt: string;
}
