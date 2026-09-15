// "Kunden Finden" (eigene Sidebar-Seite, Nutzerwunsch): Integration mit dem
// externen Google-Maps-Scraper, siehe Backend src/core/customer-finder-scraper.ts.
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
  createdAt: string;
}
