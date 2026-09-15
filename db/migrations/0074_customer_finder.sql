-- "Kunden Finden" (eigene Sidebar-Seite, Nutzerwunsch): Integration mit einem
-- externen Google-Maps-Scraper (gosom/google-maps-scraper, laeuft als
-- eigener Docker-Service "scraper" im projectops-Netzwerk, siehe
-- docker-compose.production.yml). Zwei Tabellen: customer_finder_jobs
-- verfolgt den asynchronen Scraper-Job (Erstellung -> Polling -> Download),
-- customer_finder_results haelt die noch nicht bearbeiteten Lead-Zeilen.
CREATE TABLE customer_finder_jobs (
    id BIGSERIAL PRIMARY KEY,
    keywords TEXT NOT NULL,
    city TEXT NOT NULL,
    -- UUID vom Scraper (POST /api/v1/jobs -> {"id":"<uuid>"}). NULL bis der
    -- Scraper-Call erfolgreich war.
    scraper_job_id TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'WORKING', 'DONE', 'FAILED')),
    -- Suchfilter (Nutzerwunsch): nur Ergebnisse ohne Website bzw. mit
    -- weniger als N Bewertungen werden beim Import in customer_finder_results
    -- uebernommen - siehe customer-finder-poller.ts.
    filter_no_website BOOLEAN NOT NULL DEFAULT FALSE,
    filter_max_review_count INTEGER,
    result_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_finder_results (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT REFERENCES customer_finder_jobs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    website TEXT,
    category TEXT,
    address TEXT,
    rating NUMERIC,
    review_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_finder_results_job_id ON customer_finder_results (job_id);
