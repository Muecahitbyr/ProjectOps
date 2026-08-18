-- Phase 27 "Enterprise Deployment Tracking & Change Correlation".
--
-- Bestandsanalyse: types/diagnostic-snapshot.types.ts (Phase 10) hat seit
-- jeher ein Feld "activeDeployments: never[]" mit dem expliziten Kommentar
-- "ProjectOps hat keine Deployment-Tracking-Funktion (keine erfundenen
-- Daten fuer ein Feature, das im Projekt nicht existiert), das Feld bleibt
-- strukturell vorbereitet fuer eine spaetere Erweiterung." Diese Phase loest
-- genau dieses vorbereitete Feld ein, statt ein neues Parallelkonzept zu
-- erfinden. Deployments sind bewusst KEINE Kopie/Erweiterung von Incidents
-- oder Postmortems, sondern ein eigenes, einfaches Ereignis-Log: "wann wurde
-- welche Version in welcher Umgebung ausgeliefert" - die einzige neue
-- Tabelle dieser Phase.
--
-- Auftragspunkt "keine unnoetigen Migrationen" - die audit_log-Kategorie-
-- Erweiterung wird bewusst NICHT als eigene Migration angelegt, sondern wie
-- bereits in Phase 24 (0046_on_call_scheduling.sql) direkt hier gebuendelt,
-- da beide Aenderungen ohnehin gemeinsam ausgerollt werden.
--
-- Kein Organisations-/Team-Bezug auf dieser Tabelle: Deployments haengen
-- (wie Incidents, Checks, Services mit projectId) direkt am Projekt: die
-- Organisation/das Team ergibt sich ueber projects.organization_id/team_id,
-- exakt wie bei incidents (siehe incidents_project_id_fkey ON DELETE
-- CASCADE) - keine redundante Spalte.
--
-- Bewusst KEIN neues PlanLimits-Feld ("deploymentsPerOrganization"): anders
-- als Services/SLOs/On-Call-Schedules/Automation-/Alert-Regeln (begrenzte,
-- selten geaenderte Konfigurationsressourcen mit sinnvollem Gesamtlimit)
-- ist ein Deployment ein wachsendes Ereignis-Log wie Incidents/Timeline-
-- Events/Notifications/Audit-Log - fuer diese Kategorie existiert im ganzen
-- System bewusst KEIN "maxX pro Organisation"-Limit, sondern ausschliesslich
-- der bereits vorhandene generische Requests-pro-Minute/-Tag-Schutz
-- (middleware/api-key-auth.ts). Ein neues Limit hier waere ein
-- inkonsistentes Sonderkonzept ohne fachlichen Mehrwert.
CREATE TABLE IF NOT EXISTS deployments (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- Freitext statt Enum: Umgebungsnamen sind team-spezifisches Vokabular
    -- (production/staging/canary/prod-eu/...), keine feste, vom System
    -- vorgegebene Menge - anders als z.B. incident_postmortems.status, das
    -- eine echte, vom Code erzwungene Zustandsmaschine ist.
    environment TEXT NOT NULL DEFAULT 'production',
    version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'FAILED', 'IN_PROGRESS')),
    description TEXT,
    -- NULL bei ueber die externe API (CI/CD) ausgeloesten Deployments -
    -- exakt dasselbe etablierte Muster wie automation_executions.executed_by
    -- (siehe dortigen Kommentar "bleiben bewusst ungesetzt"): die API-Key-
    -- Identitaet steckt stattdessen im Audit-Log-Eintrag (metadata.
    -- actorApiKeyId), keine eigene FK-Spalte hierfuer noetig.
    deployed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    deployed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Traegt sowohl "Deployments eines Projekts, neueste zuerst" (Listen-
-- ansicht) als auch die Incident-Korrelationsabfrage ("Deployments dieses
-- Projekts kurz vor Zeitpunkt X") effizient.
CREATE INDEX IF NOT EXISTS idx_deployments_project_id_deployed_at ON deployments (project_id, deployed_at DESC);

ALTER TABLE audit_log DROP CONSTRAINT audit_log_category_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_category_check CHECK (category IN (
    'AUTH', 'ALERT', 'AUTOMATION', 'NOTIFICATION', 'INCIDENT',
    'MAINTENANCE', 'BACKUP', 'USER', 'SYSTEM', 'SLO', 'SERVICE', 'ON_CALL', 'DEPLOYMENT'
));
