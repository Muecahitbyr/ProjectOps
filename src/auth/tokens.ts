import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto";
import { ACCESS_TOKEN_TTL_SECONDS, JWT_ACCESS_SECRET } from "../config/auth.config";

export interface AccessTokenPayload {
  sub: string; // users.id
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies AccessTokenPayload, JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

// undefined statt Wurf bei ungueltigem/abgelaufenem Token - der Aufrufer
// (middleware/authenticate.ts) entscheidet, wie darauf reagiert wird (401),
// ohne dass jede Aufrufstelle einen try/catch um jwt.verify() braucht.
export function verifyAccessToken(token: string): AccessTokenPayload | undefined {
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
    if (typeof decoded === "object" && decoded !== null && typeof decoded.sub === "string") {
      return { sub: decoded.sub };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// Refresh-Tokens sind bewusst KEINE JWTs, sondern zufaellige, undurchsichtige
// Werte mit serverseitiger Session (auth_sessions, Migration 0024) - das
// erlaubt echten Widerruf (Logout) und Rotation, was bei rein zustandslosen
// JWTs ohne zusaetzliche Blocklist nicht moeglich waere.
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

// Nur der Hash wird in auth_sessions gespeichert (analog zu password_hash) -
// SHA-256 statt bcrypt, da der Eingabewert bereits hochentropisch/zufaellig
// ist (kein Brute-Force-Ziel wie ein von Menschen gewaehltes Passwort).
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
