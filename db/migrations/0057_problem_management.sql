-- Phase 35 "Enterprise Problem Management & Root-Cause Intelligence".
-- Bestandsanalyse ergab: KEINE bestehende Problem-Management-Struktur (nur
-- generische Wortverwendung von "Problem" im Code, keine Domain-Tabelle).
-- incident_postmortems (Migration 0047) hat bereits ein eigenes root_cause-
-- Feld, aber PRO INCIDENT - keine Struktur, die mehrere wiederkehrende
-- Incidents unter einer dauerhaften, langlebigen Ursache buendelt. Das ist
-- die echte Luecke, die diese Migration schliesst. Reine Konfigurations-/
-- Zuordnungsdaten, keine Rohdaten-Duplikate (Incident-/Change-Daten bleiben
-- ausschliesslich in ihren bestehenden Tabellen).
CREATE TABLE problems (
    id BIGSERIAL PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN (
        'OPEN', 'INVESTIGATING', 'KNOWN_ERROR', 'MITIGATED', 'RESOLVED', 'CLOSED'
    )),
    priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    -- Tenant-Sicherheit fuer owner_user_id wird auf Anwendungsebene geprueft
    -- (echte Organisationsmitgliedschaft, siehe core/problem-management.ts) -
    -- dieselbe Grenze, die changes.owner_id (Migration 0051) und
    -- slos.created_by (Migration 0042) bereits verwenden; eine DB-Constraint
    -- kann eine Mitgliedschaftspruefung ueber organization_members nicht
    -- deklarativ abbilden.
    owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    root_cause TEXT,
    workaround TEXT,
    -- Auftragspunkt 7 "Known Error": bewusst KEIN eigenes known_error-
    -- Boolean-Feld - status='KNOWN_ERROR' IST bereits der Known-Error-
    -- Marker (derselbe "keine redundanten, aus dem Status ableitbaren
    -- Felder"-Grundsatz wie bei incident_postmortems.status/changes.status/
    -- slos - siehe jeweilige Migrationskommentare). Root Cause + Workaround
    -- sind ohnehin bereits eigene Felder oben.
    remediation TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_problems_organization_id ON problems (organization_id);
CREATE INDEX idx_problems_status ON problems (status);
CREATE INDEX idx_problems_priority ON problems (priority);
CREATE INDEX idx_problems_owner_user_id ON problems (owner_user_id) WHERE owner_user_id IS NOT NULL;

-- Auftragspunkt 5 "Problem <-> Incident Relation" - echtes N:M (nicht nur
-- 1:N): ein Problem hat fast immer mehrere Incidents, aber in seltenen,
-- fachlich plausiblen Faellen traegt ein einzelner Incident zu mehreren
-- zugrunde liegenden Ursachen bei (z.B. ein kaskadierender Ausfall, der
-- sowohl "Firestore Connection Instability" als auch "Retry-Sturm im
-- Client" beruehrt) - eine 1:N-Einschraenkung wuerde diesen Fall zwingen,
-- Incidents kuenstlich einem einzigen Problem zuzuordnen. Reine
-- Zuordnungstabelle, keine Kopie von Incident-Daten.
CREATE TABLE problem_incidents (
    id BIGSERIAL PRIMARY KEY,
    problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (problem_id, incident_id)
);

CREATE INDEX idx_problem_incidents_problem_id ON problem_incidents (problem_id);
CREATE INDEX idx_problem_incidents_incident_id ON problem_incidents (incident_id);

-- Auftragspunkt 9 "Problem <-> Change" - dieselbe N:M-Zuordnungstabelle wie
-- problem_incidents oben, verlinkt AUSSCHLIESSLICH auf die bestehende
-- changes-Tabelle (Migration 0051) - kein zweiter Change-Datensatz, keine
-- neue Change-Engine.
CREATE TABLE problem_changes (
    id BIGSERIAL PRIMARY KEY,
    problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    change_id BIGINT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (problem_id, change_id)
);

CREATE INDEX idx_problem_changes_problem_id ON problem_changes (problem_id);
CREATE INDEX idx_problem_changes_change_id ON problem_changes (change_id);

-- Neue Audit-Kategorie "PROBLEM" - TS-Union-Typ (types/audit.types.ts,
-- Backend UND Frontend) UND DB-CHECK-Constraint werden bewusst IN DERSELBEN
-- Migration ergaenzt (Lehre aus dem in Phase 22 gefundenen Bug, siehe
-- Migration 0043: dort wurde "SLO" zunaechst nur im TS-Typ ergaenzt, die
-- DB-Constraint vergessen - jeder recordAuditLog({category:"SLO"})-Aufruf
-- schlug dadurch bis zur Nachbesserung still fehl).
ALTER TABLE audit_log DROP CONSTRAINT audit_log_category_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_category_check CHECK (category IN (
    'AUTH', 'ALERT', 'AUTOMATION', 'NOTIFICATION', 'INCIDENT', 'MAINTENANCE', 'BACKUP', 'USER',
    'SYSTEM', 'SLO', 'SERVICE', 'ON_CALL', 'DEPLOYMENT', 'CHANGE', 'PROBLEM'
));
