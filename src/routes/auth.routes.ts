import { Router } from "express";
import { z } from "zod";
import {
  createSession,
  getActiveSessionByTokenHash,
  getUserByEmailWithPassword,
  revokeSessionByTokenHash,
  rotateSession,
} from "../db/auth.repository";
import { getProjectsForUser, getUserById } from "../db/users.repository";
import { verifyPassword } from "../auth/password";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../auth/tokens";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../config/auth.config";
import { authenticate } from "../middleware/authenticate";
import { loginRateLimiter } from "../middleware/rate-limit";
import { AppError } from "../core/app-error";
import { logger } from "../core/logger";
import { recordAuditLog } from "../core/audit-log";
import type { Response } from "express";

export const authRouter = Router();

const isProduction = process.env.NODE_ENV === "production";

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_TOKEN_COOKIE_PATH });
}

async function issueSession(res: Response, userId: string, userAgent: string | undefined): Promise<void> {
  const accessToken = signAccessToken(userId);
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  await createSession(userId, hashRefreshToken(refreshToken), expiresAt, userAgent);
  setAuthCookies(res, accessToken, refreshToken);
}

// Oeffentliche Registrierung (vormals /auth/register) ist seit 2026-10-07
// VOLLSTAENDIG entfernt, nicht nur fuer unbekannte E-Mails gesperrt
// (Nutzerwunsch: "ich soll der einzige sein") - der Endpunkt existiert
// nicht mehr, kein Fallback/Invite-Claim-Pfad. Vorgeschichte: zunaechst war
// der Endpunkt fuer JEDEN im Internet offen und legte sofort ein voll
// funktionsfaehiges Konto an (echter, live gefundener Sicherheitsfund) -
// Todos/Akquise/Nisan/Kunden-Finden/Projekte haben bewusst KEIN
// projektbezogenes RBAC ("jeder angemeldete Nutzer dieses internen
// Einzelbetreiber-Tools sieht/verwaltet alle Eintraege", siehe deren
// Routen-Kommentare) - das setzt voraus, dass "angemeldet" tatsaechlich
// "der Betreiber selbst" bedeutet. Es gibt in Produktion ohnehin nur das
// eine Konto (test@test.de) - ein zweites Konto anzulegen ist kein
// vorgesehener Anwendungsfall mehr. Login (unten) bleibt unveraendert;
// ein neues Passwort fuer das bestehende Konto wird bei Bedarf direkt per
// SQL/Script gesetzt (setUserPassword() in db/auth.repository.ts bleibt
// dafuer verfuegbar), nicht ueber einen oeffentlichen Endpunkt.

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(200),
});

authRouter.post("/auth/login", loginRateLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Ungueltige Eingabe", parsed.error.flatten());
  }

  const existing = await getUserByEmailWithPassword(parsed.data.email);
  // Dieselbe Fehlermeldung fuer "kein Konto"/"kein Passwort gesetzt"/
  // "falsches Passwort" - verhindert, dass ein Angreifer per Fehlermeldung
  // gueltige E-Mail-Adressen im System aufzaehlen kann (User Enumeration).
  const invalidCredentials = new AppError(401, "INVALID_CREDENTIALS", "E-Mail oder Passwort ist falsch");
  if (!existing || !existing.passwordHash) {
    throw invalidCredentials;
  }

  const valid = await verifyPassword(parsed.data.password, existing.passwordHash);
  if (!valid) {
    throw invalidCredentials;
  }

  await issueSession(res, existing.user.id, req.header("user-agent"));
  logger.info("Login erfolgreich", { userId: existing.user.id });
  void recordAuditLog({
    userId: existing.user.id,
    action: "LOGIN",
    category: "AUTH",
    message: `Login erfolgreich (${existing.user.email})`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(existing.user);
});

authRouter.post("/auth/refresh", async (req, res) => {
  const refreshToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_TOKEN_COOKIE];
  if (!refreshToken) {
    throw new AppError(401, "AUTH_REQUIRED", "Keine gueltige Sitzung");
  }

  const session = await getActiveSessionByTokenHash(hashRefreshToken(refreshToken));
  if (!session) {
    clearAuthCookies(res);
    throw new AppError(401, "AUTH_REQUIRED", "Sitzung abgelaufen oder widerrufen");
  }

  const accessToken = signAccessToken(session.userId);
  const newRefreshToken = generateRefreshToken();
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  await rotateSession(session.id, hashRefreshToken(newRefreshToken), newExpiresAt);
  setAuthCookies(res, accessToken, newRefreshToken);
  res.status(204).end();
});

authRouter.post("/auth/logout", async (req, res) => {
  const refreshToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_TOKEN_COOKIE];
  if (refreshToken) {
    await revokeSessionByTokenHash(hashRefreshToken(refreshToken));
  }
  clearAuthCookies(res);
  res.status(204).end();
});

authRouter.get("/auth/me", authenticate, async (req, res) => {
  const user = await getUserById(req.userId!);
  if (!user) {
    clearAuthCookies(res);
    throw new AppError(401, "AUTH_REQUIRED", "Benutzer nicht mehr vorhanden");
  }
  const projects = await getProjectsForUser(user.id);
  res.json({ ...user, projects });
});
