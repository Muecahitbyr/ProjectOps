import type { CorsOptions } from "cors";
import { logger } from "../core/logger";

// Kein Wildcard ("*") - nur explizit erlaubte Origins. Development-Default
// ist der Vite-Dev-Server; fuer Production CORS_ORIGIN in der .env setzen
// (kommagetrennt bei mehreren Origins).
// Auch vom WebSocket-Server verwendet (realtime/websocket.server.ts), um
// Upgrade-Requests gegen dieselbe Allowlist wie die HTTP-Routen zu pruefen.
//
// Phase 66 "Enterprise Final Hardening & Production Readiness" - dieselbe
// Fail-Fast-Konvention wie JWT_ACCESS_SECRET (config/auth.config.ts): der
// bisherige stille Fallback auf localhost:5173 ist in Production sicher
// (blockiert eher zu viel als zu wenig), aber ein vergessenes CORS_ORIGIN
// wuerde dort das echte Frontend unbemerkt aussperren statt frueh und klar
// aufzufallen.
function resolveAllowedOrigins(): string[] {
  const configured = process.env.CORS_ORIGIN;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CORS_ORIGIN fehlt - in Production erforderlich, siehe .env.example");
    }
    logger.warn("CORS_ORIGIN nicht gesetzt - verwende Development-Default http://localhost:5173.");
    return ["http://localhost:5173"];
  }
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const allowedOrigins = resolveAllowedOrigins();

// credentials:true noetig, damit der Browser die httpOnly Auth-Cookies
// (access_token/refresh_token, siehe config/auth.config.ts) bei
// Cross-Origin-Requests (Vite-Dev-Server -> Backend) mitsendet/annimmt.
export const corsOptions: CorsOptions = {
  origin: allowedOrigins,
  credentials: true,
};
