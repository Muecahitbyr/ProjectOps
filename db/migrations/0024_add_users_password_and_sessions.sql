-- Phase 10 "Echtes Auth-System": password_hash ist NULLABLE, damit
-- bestehende (vor Phase 10 angelegte) users-Zeilen gueltig bleiben - sie
-- koennen sich erst einloggen, nachdem sie ueber POST /api/auth/register
-- ein Passwort "beanspruchen" (siehe auth.repository.ts claimOrCreateUser).
-- Kein Klartext-Passwort wird je gespeichert, ausschliesslich der
-- bcrypt-Hash.
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- Server-seitige Session/Refresh-Token-Verwaltung (echtes Session
-- Management statt rein zustandslosem JWT) - erlaubt echtes Logout
-- (Widerruf) und Rotation. Nur der SHA-256-Hash des Refresh-Tokens wird
-- gespeichert, nie der Token selbst (analog zu password_hash: das Original
-- ist nur dem Client bekannt, per httpOnly-Cookie uebertragen).
CREATE TABLE IF NOT EXISTS auth_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id);
-- Haeufigste Abfrage beim Refresh: "ist dieser Token-Hash aktuell gueltig?"
CREATE INDEX IF NOT EXISTS idx_auth_sessions_active
    ON auth_sessions (refresh_token_hash) WHERE revoked_at IS NULL;
