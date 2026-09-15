// "Kunden Finden" (eigene Sidebar-Seite, Nutzerwunsch): Integration mit dem
// externen Google-Maps-Scraper (gosom/google-maps-scraper), siehe
// customer-finder-scraper.ts und customer-finder-poller.ts.
export type CustomerFinderJobStatus = "PENDING" | "WORKING" | "DONE" | "FAILED";

export interface CustomerFinderJob {
  id: number;
  keywords: string;
  city: string;
  scraperJobId: string | null;
  status: CustomerFinderJobStatus;
  filterNoWebsite: boolean;
  filterMaxReviewCount: number | null;
  resultCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerFinderJobInput {
  keywords: string;
  city: string;
  filterNoWebsite?: boolean | undefined;
  filterMaxReviewCount?: number | undefined;
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
  createdAt: string;
}

// Vom Scraper aus der CSV extrahierte, bereits auf die Lead-Felder
// reduzierte Zeile (siehe customer-finder-scraper.ts: extractLeadRows()) -
// noch ohne DB-Id/jobId, das kommt erst beim Insert dazu.
export interface ScrapedLead {
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  category: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
}
