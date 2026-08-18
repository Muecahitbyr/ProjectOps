-- Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
-- Risk".
--
-- Bestandsanalyse (siehe Abschlussbericht "Architekturentscheidungen"):
-- maintenance_windows (Phase 9) existiert bereits vollstaendig und wird
-- bereits von core/monitor.ts (Incident-Unterdrueckung) und alerts/
-- alert-evaluator.ts (Alert-Unterdrueckung) korrekt verwendet - NICHT
-- dupliziert. Der Service Catalog (Phase 23, services-Tabelle) ist die
-- bestehende "welche Services gehoeren zu diesem Change"-Ressource - keine
-- neue Service-Tabelle. Die Impact-Analyse-Engine (Phase 25, core/
-- topology.ts#getFullImpactAnalysis) wird unveraendert wiederverwendet.
--
-- Architekturentscheidung "keine zweite Unterdrueckungs-Engine": ein
-- IN_PROGRESS-Change bekommt KEINEN eigenen Unterdrueckungspfad in
-- core/monitor.ts. Stattdessen orchestriert der Change-Start/-Abschluss
-- automatisch ein ECHTES maintenance_windows-Fenster (siehe core/
-- change-lifecycle.ts) - dieselbe, bereits produktiv bewaehrte
-- Unterdrueckungslogik gilt dadurch automatisch auch fuer Changes, ohne
-- monitor.ts/alert-evaluator.ts ueberhaupt anzufassen. change_id auf
-- maintenance_windows ist rein informativ (Ruecknachverfolgung "welcher
-- Change hat dieses Fenster erzeugt").
CREATE TABLE changes (
    id BIGSERIAL PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    change_type TEXT NOT NULL DEFAULT 'STANDARD' CHECK (change_type IN ('STANDARD', 'NORMAL', 'EMERGENCY')),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    risk TEXT NOT NULL DEFAULT 'LOW' CHECK (risk IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    risk_assessment TEXT,
    rollback_plan TEXT,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    planned_start_at TIMESTAMPTZ,
    planned_end_at TIMESTAMPTZ,
    actual_start_at TIMESTAMPTZ,
    actual_end_at TIMESTAMPTZ,
    -- Auftragspunkt 7 "Change Approval" - die eigentliche Regel ("HIGH/
    -- CRITICAL erfordert Freigabe VOR Start, ausser EMERGENCY") lebt bewusst
    -- NICHT als DB-Constraint, sondern als konfigurierbare Funktion
    -- (config/change-management.config.ts), am Start-Endpunkt durchgesetzt -
    -- "sauber konfigurierbar, nicht hart an UI gekoppelt" (Auftrag).
    -- NOT_REQUIRED ist der Zustand fuer Emergency-Changes (Genehmigung
    -- bewusst umgangen, Auftragspunkt 8) und fuer bereits gestartete/
    -- abgeschlossene Changes, bei denen die Frage nicht mehr relevant ist.
    approval_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED')),
    approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    -- Auftragspunkt 8 "Emergency Changes" - Begruendung ist Pflicht fuer
    -- EMERGENCY (CHECK unten), fuer STANDARD/NORMAL bleibt das Feld leer.
    emergency_justification TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (planned_end_at IS NULL OR planned_start_at IS NULL OR planned_end_at > planned_start_at),
    CHECK (actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at > actual_start_at),
    CHECK (change_type != 'EMERGENCY' OR emergency_justification IS NOT NULL)
);
CREATE INDEX idx_changes_organization_id ON changes (organization_id);
CREATE INDEX idx_changes_org_status ON changes (organization_id, status);
CREATE INDEX idx_changes_planned_start ON changes (planned_start_at) WHERE planned_start_at IS NOT NULL;

-- Auftragspunkt 2 "Service-Zuordnung" - M:N ueber die bestehende
-- services-Tabelle (Phase 23), analog zum bestehenden M:N-Muster
-- service_dependencies/team_members/project_members.
CREATE TABLE change_services (
    id BIGSERIAL PRIMARY KEY,
    change_id BIGINT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
    service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (change_id, service_id)
);
CREATE INDEX idx_change_services_change_id ON change_services (change_id);
CREATE INDEX idx_change_services_service_id ON change_services (service_id);

-- Rein informative Rueckverknuepfung (siehe Architekturentscheidung oben) -
-- NULL fuer manuell angelegte Wartungsfenster (unveraendertes Verhalten).
ALTER TABLE maintenance_windows ADD COLUMN change_id BIGINT REFERENCES changes(id) ON DELETE SET NULL;
CREATE INDEX idx_maintenance_windows_change_id ON maintenance_windows (change_id) WHERE change_id IS NOT NULL;

ALTER TABLE audit_log DROP CONSTRAINT audit_log_category_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_category_check CHECK (category IN (
    'AUTH', 'ALERT', 'AUTOMATION', 'NOTIFICATION', 'INCIDENT', 'MAINTENANCE', 'BACKUP', 'USER',
    'SYSTEM', 'SLO', 'SERVICE', 'ON_CALL', 'DEPLOYMENT', 'CHANGE'
));
