-- Referenztabelle der unterstuetzten Kanaele (analog zu roles) - kein
-- Fake-Business-Daten, sondern die feste Aufzaehlung aus dem Auftrag.
CREATE TABLE IF NOT EXISTS notification_channels (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL
);

INSERT INTO notification_channels (id, description) VALUES
    ('EMAIL', 'E-Mail-Benachrichtigungen'),
    ('PUSH', 'Push-Benachrichtigungen'),
    ('IN_APP', 'In-App-Benachrichtigungen'),
    ('WEBSOCKET', 'Echtzeit-Benachrichtigungen ueber die WebSocket-Verbindung')
ON CONFLICT (id) DO NOTHING;
