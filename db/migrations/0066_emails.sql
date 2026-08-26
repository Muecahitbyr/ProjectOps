-- Cache der per IMAP abgeholten E-Mails (siehe core/email-sync.ts) - damit
-- das Frontend nicht bei jedem Laden erneut das Postfach abfragen muss und
-- "gelesen" unabhaengig vom eigentlichen Mail-Client verfolgt werden kann.
-- message_id ist die echte Message-ID aus dem E-Mail-Header (RFC 5322),
-- eindeutig ueber alle Mails hinweg - verhindert doppelte Zeilen bei
-- wiederholtem Polling derselben Nachricht.
CREATE TABLE emails (
    id BIGSERIAL PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE,
    from_address TEXT NOT NULL,
    from_name TEXT,
    subject TEXT,
    snippet TEXT,
    received_at TIMESTAMPTZ NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_emails_received_at ON emails (received_at DESC);
CREATE INDEX idx_emails_read ON emails (read);
