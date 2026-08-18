import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../auth/tokens";
import { ACCESS_TOKEN_COOKIE } from "../config/auth.config";
import { authRequiredError } from "../core/app-error";
import { setRequestUserId } from "../core/request-context";

// Phase 10: ersetzt den X-User-Id-Header aus Phase 9 (middleware/
// require-project-role.ts, entfernt) - Identitaet kommt jetzt ausschliesslich
// aus einem serverseitig signierten, httpOnly-Access-Token-Cookie, nicht
// mehr aus einem vom Client frei waehlbaren Header.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = (req.cookies as Record<string, string> | undefined)?.[ACCESS_TOKEN_COOKIE];
  if (!token) {
    throw authRequiredError();
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    throw authRequiredError("Sitzung abgelaufen");
  }

  req.userId = payload.sub;
  setRequestUserId(payload.sub);
  next();
}
