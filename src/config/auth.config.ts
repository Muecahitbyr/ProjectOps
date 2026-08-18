import { randomBytes } from "node:crypto";
import { logger } from "../core/logger";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 Minuten
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 Tage

// JWT_ACCESS_SECRET MUSS in Production per Umgebungsvariable gesetzt sein
// (siehe .env.example) - fehlt es dort, bricht der Start unten kontrolliert
// ab, statt mit einem schwachen Default weiterzulaufen. Im Development ohne
// gesetzten Wert wird ein zufaelliges, nur fuer den Prozesslebenszyklus
// gueltiges Secret erzeugt (klar geloggt) - bequem lokal, aber jede Sitzung
// wird bei einem Neustart ungueltig, daher fuer Production ungeeignet.
function resolveAccessTokenSecret(): string {
  const configured = process.env.JWT_ACCESS_SECRET;
  if (configured && configured.length >= 32) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_ACCESS_SECRET fehlt oder ist zu kurz (min. 32 Zeichen) - in Production erforderlich, siehe .env.example",
    );
  }

  const ephemeral = randomBytes(48).toString("hex");
  logger.warn(
    "JWT_ACCESS_SECRET nicht gesetzt - verwende ein zufaelliges, fluechtiges Secret fuer diesen Prozess (nur Development). " +
      "Bestehende Sitzungen werden bei jedem Neustart ungueltig.",
  );
  return ephemeral;
}

export const JWT_ACCESS_SECRET = resolveAccessTokenSecret();

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
// Refresh-Cookie nur an /api/auth senden (Cookie-Pfad) - reduziert die
// Angriffsflaeche, da der Browser ihn nicht bei jeder anderen Anfrage
// mitschickt.
export const REFRESH_TOKEN_COOKIE_PATH = "/api/auth";
