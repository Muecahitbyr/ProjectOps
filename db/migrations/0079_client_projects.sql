-- Neuer Sidebar-Reiter "Projekte" (Nutzerwunsch 2026-10-06): fuer jedes
-- eigene Kundenprojekt (z.B. eine Website, die fuer eine Firma gebaut
-- wurde) ein strukturierter Ablageort fuer Admin-Zugangsdaten und
-- allgemeine Notizen zum Kunden - bisher gab es dafuer keinen Platz, nur
-- den freien todos.category-Text (Migration 0067) zur reinen
-- Aufgabenverwaltung. "Todos"-Nav-Eintrag entfaellt mit diesem Phase-Schritt
-- zugunsten dieses Reiters (Nutzerentscheid) - TodosPanel.tsx selbst bleibt
-- unveraendert, bekommt nur die client_projects-Namen statt/zusaetzlich zu
-- den echten ueberwachten Projekten als Kategorie-Vorschlaege.
--
-- Ein Login pro Projekt (Nutzerentscheid, strukturiert statt Freitext) -
-- fuer mehrere Zugaenge (Hosting/Domain/CMS getrennt) muesste das in die
-- notes-Spalte geschrieben werden. Bewusst KEIN Fremdschluessel auf
-- acquisition_companies - eigenstaendige, flache Liste wie Todos/Nisan/
-- Kunden-Finden (gleiche "Shared Ops Console"-Konvention, kein
-- projektbezogenes RBAC).
CREATE TABLE client_projects (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    admin_login_url TEXT,
    admin_login_username TEXT,
    admin_login_password TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitiv/trim-tolerant eindeutig: der Name ist zugleich der
-- Matching-Schluessel gegen todos.category (freier Text) - zwei Projekte,
-- die sich nur in Gross-/Kleinschreibung unterscheiden, wuerden sonst
-- denselben Todo-Kategorie-Bucket faelschlich aufspalten.
CREATE UNIQUE INDEX idx_client_projects_name ON client_projects (lower(trim(name)));
