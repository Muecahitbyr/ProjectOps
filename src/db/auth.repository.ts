import { pool } from "./pool";
import type { User } from "../types/user.types";

interface UserWithPasswordRow {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  password_hash: string | null;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapUserRow(row: UserWithPasswordRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: row.avatar,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

// Separat von users.repository.ts's mapUserRow, da hier bewusst
// password_hash mitgeladen wird - ausschliesslich fuer den Login-Vergleich
// in routes/auth.routes.ts, nie Teil des oeffentlichen User-Typs, der ueber
// /api/users nach aussen geht.
export async function getUserByEmailWithPassword(
  email: string,
): Promise<{ user: User; passwordHash: string | null } | undefined> {
  const { rows } = await pool.query<UserWithPasswordRow>(
    `SELECT id, name, email, avatar, created_at, updated_at, password_hash FROM users WHERE email = $1`,
    [email],
  );
  const row = rows[0];
  if (!row) return undefined;
  return { user: mapUserRow(row), passwordHash: row.password_hash };
}

export async function setUserPassword(userId: string, passwordHash: string): Promise<void> {
  await pool.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [userId, passwordHash]);
}

export interface CreateUserWithPasswordInput {
  name: string;
  email: string;
  passwordHash: string;
}

export async function createUserWithPassword(input: CreateUserWithPasswordInput): Promise<User> {
  const { rows } = await pool.query<UserWithPasswordRow>(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
     RETURNING id, name, email, avatar, created_at, updated_at, password_hash`,
    [input.name, input.email, input.passwordHash],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Benutzer konnte nicht angelegt werden");
  }
  return mapUserRow(row);
}

// ---------------------------------------------------------------------------
// Sessions (Refresh-Tokens) - echtes Session Management statt rein
// zustandsloser JWTs, siehe Migration 0024.
// ---------------------------------------------------------------------------
export interface AuthSession {
  id: number;
  userId: string;
  expiresAt: string;
  revokedAt: string | null;
}

interface AuthSessionRow {
  id: number;
  user_id: string;
  expires_at: string | Date;
  revoked_at: string | Date | null;
}

function mapSessionRow(row: AuthSessionRow): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: toIsoString(row.expires_at),
    revokedAt: row.revoked_at === null ? null : toIsoString(row.revoked_at),
  };
}

export async function createSession(
  userId: string,
  refreshTokenHash: string,
  expiresAt: Date,
  userAgent: string | undefined,
): Promise<AuthSession> {
  const { rows } = await pool.query<AuthSessionRow>(
    `INSERT INTO auth_sessions (user_id, refresh_token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, expires_at, revoked_at`,
    [userId, refreshTokenHash, userAgent ?? null, expiresAt.toISOString()],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Sitzung konnte nicht angelegt werden");
  }
  return mapSessionRow(row);
}

// Nur aktive (nicht widerrufene, nicht abgelaufene) Sitzungen gelten als
// gueltig - der Aufrufer (routes/auth.routes.ts) muss expires_at nicht
// separat vergleichen.
export async function getActiveSessionByTokenHash(refreshTokenHash: string): Promise<AuthSession | undefined> {
  const { rows } = await pool.query<AuthSessionRow>(
    `SELECT id, user_id, expires_at, revoked_at FROM auth_sessions
     WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [refreshTokenHash],
  );
  return rows[0] ? mapSessionRow(rows[0]) : undefined;
}

// Rotation: derselbe Sitzungsdatensatz (id/created_at bleiben als
// "Sitzungsbeginn" erhalten), nur Token-Hash und Ablauf wandern weiter -
// verhindert, dass ein gestohlener alter Refresh-Token nach Rotation noch
// funktioniert (Token Reuse Detection waere ein sinnvoller naechster
// Schritt, siehe Abschlussbericht).
export async function rotateSession(sessionId: number, newRefreshTokenHash: string, newExpiresAt: Date): Promise<void> {
  await pool.query(`UPDATE auth_sessions SET refresh_token_hash = $2, expires_at = $3 WHERE id = $1`, [
    sessionId,
    newRefreshTokenHash,
    newExpiresAt.toISOString(),
  ]);
}

export async function revokeSessionByTokenHash(refreshTokenHash: string): Promise<void> {
  await pool.query(`UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL`, [
    refreshTokenHash,
  ]);
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await pool.query(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}
