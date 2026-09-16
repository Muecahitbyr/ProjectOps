-- Akquise-Mini-CRM (Nutzerwunsch 2026-09-16): Kontaktdaten aus "Kunden
-- Finden" gingen beim Uebernehmen bisher verloren (nur der Name wurde
-- uebertragen) - jetzt werden Telefon/Email/Website/Branche/Adresse
-- mitgenommen, ausserdem eine Wiedervorlage ("naechster Kontakt am") und ein
-- strukturierter Anruf-/Kontaktversuchsverlauf, damit bei vielen parallelen
-- Leads nichts durcheinander geraet und man sieht, was man bei einer
-- schwer erreichbaren Firma (Friseure/Restaurants waehrend der
-- Geschaeftszeiten) schon versucht hat.
ALTER TABLE acquisition_companies
    ADD COLUMN phone TEXT,
    ADD COLUMN email TEXT,
    -- Eigener Name statt "website" - sonst verwechselbar mit dem
    -- bestehenden BOOLEAN "website_built" (Pipeline-Schritt), das etwas
    -- komplett anderes bedeutet (ob WIR dem Kunden eine Website gebaut
    -- haben, nicht ob der Kunde schon eine hat).
    ADD COLUMN website_url TEXT,
    ADD COLUMN category TEXT,
    ADD COLUMN address TEXT,
    ADD COLUMN next_contact_at DATE;

CREATE TABLE acquisition_contact_attempts (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES acquisition_companies(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL CHECK (outcome IN ('NOT_REACHED', 'SPOKE_TO_STAFF', 'SPOKE_TO_OWNER', 'CALLBACK_REQUESTED', 'OTHER')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_acquisition_contact_attempts_company_id ON acquisition_contact_attempts (company_id);
