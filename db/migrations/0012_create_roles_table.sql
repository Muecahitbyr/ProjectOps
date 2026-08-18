-- Feste Rollen-Aufzaehlung (kein Fake-Business-Daten, sondern eine
-- Referenztabelle analog zu einem Enum - noetig, damit project_members.role_id
-- per Fremdschluessel auf gueltige Werte verweisen kann).
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL
);

INSERT INTO roles (id, description) VALUES
    ('OWNER', 'Vollzugriff inkl. Mitglieder- und Rollenverwaltung'),
    ('ADMIN', 'Verwaltung von Projekten, Alert-Regeln und Benachrichtigungen'),
    ('DEVELOPER', 'Lese- und Schreibzugriff auf Monitoring-Daten'),
    ('VIEWER', 'Nur Lesezugriff')
ON CONFLICT (id) DO NOTHING;
