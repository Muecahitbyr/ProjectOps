-- Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
-- Intelligence". Architekturentscheidung (siehe Abschlussbericht Punkt 4):
-- "projects" bleibt die alleinige Monitoring-Identitaet (Checks/Health/
-- Incidents haengen dort) - es wird NICHT parallel eine zweite
-- Monitoring-Entitaet eingefuehrt. "services" ist eine eigenstaendige
-- Katalog-/Metadaten-Ebene DARUEBER: project_id ist bewusst NULLABLE, weil
-- ein Service im Katalog auch eine NICHT von ProjectOps ueberwachte externe
-- Abhaengigkeit sein kann (z.B. "Stripe" als reiner Graph-Knoten fuer
-- Dependency Mapping, ohne eigene Checks). Ein Service mit project_id
-- gesetzt "erbt" seine operative Health/Verfuegbarkeit/SLOs aus den
-- bestehenden Tabellen (siehe core/service-health.ts) - keine Duplizierung
-- von Check-/Incident-/SLO-Daten hier.
CREATE TABLE services (
    id BIGSERIAL PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    -- Technischer Owner: ein echter ProjectOps-Benutzer (Auftragspunkt 3).
    technical_owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    -- Business Owner: bewusst Freitext statt einer weiteren User-FK - ein
    -- fachlicher Stakeholder hat nicht zwingend einen ProjectOps-Account
    -- ("keine komplexe Benutzer-RBAC-Erweiterung bauen", Auftragspunkt 3).
    business_owner TEXT,
    criticality TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    -- Eigene, dokumentierte Annahme (keine externe Vorgabe im Auftrag) -
    -- die drei ueblichen Umgebungsstufen.
    environment TEXT NOT NULL DEFAULT 'PRODUCTION' CHECK (environment IN ('PRODUCTION', 'STAGING', 'DEVELOPMENT')),
    lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_status IN ('ACTIVE', 'DEPRECATED', 'RETIRED')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Ein Projekt kann hoechstens EINEM Service als operative Grundlage
    -- dienen - verhindert zwei Kataloge-Eintraege, die auf dieselben
    -- Check-/Health-Daten zeigen (uneindeutige "Service Health").
    UNIQUE (project_id)
);
CREATE INDEX idx_services_organization_id ON services (organization_id);
CREATE INDEX idx_services_team_id ON services (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX idx_services_project_id ON services (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_services_lifecycle_status ON services (lifecycle_status);

-- Gerichtete Kante: source (der ABHAENGIGE Service) -> target (die
-- Abhaengigkeit). "A depends on B" wird NUR als (source=A, target=B)
-- gespeichert (Auftragspunkt 4) - nie zusaetzlich die Umkehrung.
-- organization_id ist bewusst denormalisiert (statt ueber source/target
-- services zu joinen) fuer schnelle, direkte Tenant-Filterung/Indizierung
-- (Auftragspunkt 25) und weil BEIDE Seiten laut Auftragspunkt 20 ohnehin
-- zwingend zur selben Organisation gehoeren muessen (siehe
-- db/service-dependencies.repository.ts, applikationsseitig durchgesetzt -
-- ein DB-CHECK kann nicht ueber zwei fremde Zeilen hinweg vergleichen ohne
-- Trigger, was hier bewusst vermieden wird).
CREATE TABLE service_dependencies (
    id BIGSERIAL PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    target_service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL CHECK (dependency_type IN (
        'API', 'DATABASE', 'EXTERNAL_SERVICE', 'INTERNAL_SERVICE', 'QUEUE', 'STORAGE'
    )),
    criticality TEXT NOT NULL DEFAULT 'CRITICAL' CHECK (criticality IN ('CRITICAL', 'OPTIONAL')),
    description TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT service_dependencies_no_self CHECK (source_service_id != target_service_id),
    -- Auftragspunkt 25 "Unique Constraint fuer identische Dependency-Kanten".
    -- Die direkte Umkehr-Kante (B->A wenn A->B bereits existiert) wird
    -- APPLIKATIONSSEITIG verhindert (db/service-dependencies.repository.ts) -
    -- ein DB-CHECK kann "existiert die Umkehrzeile" nicht selbst pruefen.
    UNIQUE (source_service_id, target_service_id)
);
CREATE INDEX idx_service_dependencies_organization_id ON service_dependencies (organization_id);
CREATE INDEX idx_service_dependencies_source_service_id ON service_dependencies (source_service_id);
CREATE INDEX idx_service_dependencies_target_service_id ON service_dependencies (target_service_id);
CREATE INDEX idx_service_dependencies_type ON service_dependencies (dependency_type);
