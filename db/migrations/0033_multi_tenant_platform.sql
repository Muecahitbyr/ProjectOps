-- Phase 15 "Enterprise Platform, Multi-Tenant SaaS & Global Operations".
-- Rein additiv: bestehende Tabellen (projects, alert_rules, ...) werden nur
-- um nullable/defaultierte Spalten erweitert, nie veraendert/entfernt. Eine
-- Default-Organisation wird automatisch erzeugt und alle bestehenden
-- Projekte werden ihr zugeordnet - keine manuelle Migration bestehender
-- Daten noetig (siehe Auftrag).

CREATE TABLE organizations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'PRO', 'ENTERPRISE')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    -- "Logo (Vorbereitung)" - Feld existiert, es gibt aber keinen Upload-
    -- Mechanismus (kein neues Dateispeicher-Subsystem, siehe Auftrag "keine
    -- Parallelimplementierungen") - bleibt ehrlich NULL, bis eine echte
    -- Upload-Loesung existiert.
    logo_url TEXT,
    brand_color TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    language TEXT NOT NULL DEFAULT 'en',
    region TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rollenmodell (Auftragspunkt 4) - ERWEITERT das bestehende project_members.
-- role_id-System (OWNER/ADMIN/DEVELOPER/VIEWER, siehe roles-Tabelle), ersetzt
-- es nicht: dies ist eine eigene Dimension (Organisations-/Team-Ebene statt
-- Projekt-Ebene), daher eigene CHECK-Aufzaehlung statt der roles-Tabelle
-- (analog zum CHECK-Konstrukt-Muster aus Phase 13/14, z.B. audit_log.category).
CREATE TABLE organization_members (
    id BIGSERIAL PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL CHECK (role_id IN (
        'PLATFORM_OWNER', 'ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'SECURITY_ADMIN',
        'BILLING_ADMIN', 'DEVELOPER', 'OPERATOR', 'VIEWER', 'SERVICE_ACCOUNT'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_organization_members_user_id ON organization_members (user_id);
CREATE INDEX idx_organization_members_org_id ON organization_members (organization_id);

CREATE TABLE teams (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);
CREATE INDEX idx_teams_organization_id ON teams (organization_id);

CREATE TABLE team_members (
    id BIGSERIAL PRIMARY KEY,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL CHECK (role_id IN (
        'PLATFORM_OWNER', 'ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'SECURITY_ADMIN',
        'BILLING_ADMIN', 'DEVELOPER', 'OPERATOR', 'VIEWER', 'SERVICE_ACCOUNT'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (team_id, user_id)
);
CREATE INDEX idx_team_members_user_id ON team_members (user_id);
CREATE INDEX idx_team_members_team_id ON team_members (team_id);

CREATE TABLE project_teams (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, team_id)
);
CREATE INDEX idx_project_teams_team_id ON project_teams (team_id);

-- "Team-spezifische Alerts" (Auftragspunkt 3) - additive, optionale
-- Zuordnung; alert_rules bleibt sonst unveraendert funktionsfaehig.
ALTER TABLE alert_rules ADD COLUMN team_id TEXT REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX idx_alert_rules_team_id ON alert_rules (team_id) WHERE team_id IS NOT NULL;

-- "Team Notification Settings" (Auftragspunkt 3) - bewusst eine eigene,
-- schlanke Tabelle statt user_notification_settings zu erweitern: das ist
-- ein anderes Konzept (welche Kanaele ein TEAM als Ganzes fuer
-- teamrelevante Ereignisse nutzt, nicht individuelle Nutzerpraeferenzen
-- inkl. Ruhezeiten/Filtern).
CREATE TABLE team_notification_settings (
    id BIGSERIAL PRIMARY KEY,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES notification_channels(id),
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (team_id, channel_id)
);

-- API Keys (Auftragspunkt 5) - nur Hash gespeichert (analog zu
-- monitoring_agents.agent_secret_hash, Phase 14): ein Bearer-Credential,
-- das WIR nur vergleichen, nie erneut im Klartext benoetigen.
CREATE TABLE api_keys (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    -- Erste 8 Zeichen des echten Keys im Klartext (wie GitHub PATs) - reine
    -- Wiedererkennungshilfe in der UI, kein Sicherheitsrisiko.
    key_prefix TEXT NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    usage_count BIGINT NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_organization_id ON api_keys (organization_id);

-- Service Accounts (Auftragspunkt 6) - "Nur Backend": kein Login-UI-Flow,
-- ausschliesslich maschinelle Bearer-Authentifizierung wie API Keys.
CREATE TABLE service_accounts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    secret_rotated_at TIMESTAMPTZ,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_service_accounts_organization_id ON service_accounts (organization_id);

-- Webhooks (Auftragspunkt 7). Anders als API-Key-/Service-Account-Secrets
-- (reine Vergleichs-Credentials) MUSS das Webhook-Secret spaeter wieder im
-- Klartext verfuegbar sein, um jede ausgehende Zustellung zu signieren
-- (HMAC) - ein reiner Hash reicht hier strukturell nicht aus. Es wird daher
-- echt symmetrisch verschluesselt (AES-256-GCM, siehe core/crypto.ts),
-- nicht im Klartext gespeichert.
CREATE TABLE webhooks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret_encrypted TEXT NOT NULL,
    events TEXT[] NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhooks_organization_id ON webhooks (organization_id);

-- Retry Queue / Delivery Logs / Dead Letter Queue in einer Tabelle (Status-
-- Uebergaenge PENDING -> DELIVERED oder PENDING -> ... -> DEAD_LETTER nach
-- MAX_ATTEMPTS, siehe core/webhook-delivery.ts) - verarbeitet vom
-- bestehenden Scheduler-Tick (core/monitor.ts), kein neuer Poller.
CREATE TABLE webhook_deliveries (
    id BIGSERIAL PRIMARY KEY,
    webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DELIVERED', 'FAILED', 'DEAD_LETTER')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error TEXT,
    response_status INTEGER,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries (webhook_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries (next_attempt_at) WHERE status = 'PENDING';

-- Tenant-Zuordnung bestehender Projekte (Auftragspunkt 1/2) - additiv:
-- zunaechst nullable, nach dem automatischen Backfill unten NOT NULL.
ALTER TABLE projects ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;

DO $$
DECLARE
    default_org_id TEXT;
BEGIN
    INSERT INTO organizations (name, slug, plan, status, timezone, language)
    VALUES ('Default Organization', 'default', 'ENTERPRISE', 'ACTIVE', 'UTC', 'en')
    RETURNING id INTO default_org_id;

    UPDATE projects SET organization_id = default_org_id WHERE organization_id IS NULL;

    -- Jeder bestehende Projekt-OWNER (echte, bereits vorhandene Autoritaet
    -- aus project_members, Phase 9/10) wird ehrlich als ORGANIZATION_OWNER
    -- der Default-Organisation nachgezogen - keine erfundene Zuordnung,
    -- sondern eine Ableitung aus bereits realen Daten. Ohne dies koennte
    -- niemand die neue Organisation je verwalten.
    INSERT INTO organization_members (organization_id, user_id, role_id)
    SELECT DISTINCT default_org_id, pm.user_id, 'ORGANIZATION_OWNER'
    FROM project_members pm
    WHERE pm.role_id = 'OWNER'
    ON CONFLICT (organization_id, user_id) DO NOTHING;
END $$;

ALTER TABLE projects ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_projects_organization_id ON projects (organization_id);
