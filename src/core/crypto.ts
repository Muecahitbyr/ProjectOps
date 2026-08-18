import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { logger } from "./logger";

// Phase 15 Teil 7 "Webhooks" - im Unterschied zu Passwoertern/Refresh-
// Tokens/Agent-Secrets (Phase 9/14, immer nur gehasht/verglichen) muss ein
// Webhook-Secret spaeter wieder im Klartext vorliegen, um jede ausgehende
// Zustellung zu signieren (HMAC-SHA256) - eine echte, umkehrbare
// Verschluesselung (AES-256-GCM) ist hier strukturell noetig, kein Hash.
//
// WEBHOOK_SECRET_ENCRYPTION_KEY MUSS in Production gesetzt sein (siehe
// .env.example) - analog zu JWT_ACCESS_SECRET in config/auth.config.ts:
// fehlt sie dort, bricht der Start kontrolliert ab. In Development wird ein
// zufaelliges, nur fuer den Prozesslebenszyklus gueltiges Schluesselmaterial
// erzeugt (klar geloggt) - bereits verschluesselte Secrets werden nach einem
// Neustart ohne die echte Variable nicht mehr entschluesselbar.
function resolveEncryptionKey(): Buffer {
  const configured = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  if (configured && configured.length >= 32) {
    return scryptSync(configured, "projectops-webhook-secret-salt", 32);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "WEBHOOK_SECRET_ENCRYPTION_KEY fehlt oder ist zu kurz (min. 32 Zeichen) - in Production erforderlich, siehe .env.example",
    );
  }

  logger.warn(
    "WEBHOOK_SECRET_ENCRYPTION_KEY nicht gesetzt - verwende zufaelliges, fluechtiges Schluesselmaterial fuer diesen Prozess " +
      "(nur Development). Bereits gespeicherte Webhook-Secrets werden nach einem Neustart unlesbar.",
  );
  return randomBytes(32);
}

const encryptionKey = resolveEncryptionKey();
const IV_LENGTH = 12;

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(encrypted: string): string {
  const raw = Buffer.from(encrypted, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}
