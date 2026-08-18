import { Router } from "express";
import { z } from "zod";
import {
  createSession,
  createUserWithPassword,
  getActiveSessionByTokenHash,
  getUserByEmailWithPassword,
  revokeSessionByTokenHash,
  rotateSession,
  setUserPassword,
} from "../db/auth.repository";
import { getProjectsForUser, getUserById } from "../db/users.repository";
import { hashPassword, verifyPassword } from "../auth/password";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../auth/tokens";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../config/auth.config";
import { authenticate } from "../middleware/authenticate";
import { loginRateLimiter, registerRateLimiter } from "../middleware/rate-limit";
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

const passwordSchema = z
  .string()
  .min(8, "Passwort muss mindestens 8 Zeichen lang sein")
  .max(200);

const registerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  password: passwordSchema,
});

// Auftragspunkt 1 "Echtes Auth-System". Registrierung deckt zwei reale
// Faelle ab, die beide ohne Fake-Daten auskommen muessen:
//   (a) eine komplett neue E-Mail -> neuer Benutzer mit Passwort.
//   (b) eine bereits (z.B. von einem Projekt-Owner per POST /api/users
//       eingeladene) bestehende E-Mail OHNE Passwort -> das Konto wird durch
//       Setzen des ersten Passworts "beansprucht" (kein Duplikat, keine
//       verwaisten project_members-Zeilen). Existiert bereits ein Passwort,
//       ist das ein Konflikt (jemand versucht, ein fremdes Konto zu
//       uebernehmen).
authRouter.post("/auth/register", registerRateLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Ungueltige Eingabe", parsed.error.flatten());
  }

  const { name, email, password } = parsed.data;
  const existing = await getUserByEmailWithPassword(email);

  let userId: string;
  if (existing) {
    if (existing.passwordHash) {
      throw new AppError(409, "CONFLICT", "Ein Benutzer mit dieser E-Mail existiert bereits");
    }
    userId = existing.user.id;
    await setUserPassword(userId, await hashPassword(password));
  } else {
    const created = await createUserWithPassword({ name, email, passwordHash: await hashPassword(password) });
    userId = created.id;
  }

  await issueSession(res, userId, req.header("user-agent"));
  const user = await getUserById(userId);
  logger.info("Benutzer registriert/Konto beansprucht", { userId });
  void recordAuditLog({
    userId,
    action: existing ? "ACCOUNT_CLAIMED" : "USER_REGISTERED",
    category: "AUTH",
    message: `${existing ? "Konto beansprucht" : "Registrierung"} (${email})`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(user);
});

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
