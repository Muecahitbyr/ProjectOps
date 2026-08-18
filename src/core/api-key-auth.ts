import { randomBytes, createHash } from "node:crypto";

// Phase 15 Teil 5/6 "API Keys"/"Service Accounts" - dieselbe Hash-Strategie
// wie Agent Secrets (Phase 14 core/agent-auth.ts) und Refresh-Tokens
// (auth/tokens.ts): ein API Key/Service-Account-Secret ist bereits ein
// zufaelliger, hochentropischer Wert - SHA-256-Hash-Vergleich genuegt,
// keine umkehrbare Verschluesselung noetig (anders als Webhook-Secrets,
// siehe core/crypto.ts, die WIR spaeter wieder zum Signieren brauchen).
export function generateApiKeyPlaintext(): string {
  return `pok_${randomBytes(32).toString("base64url")}`;
}

export function apiKeyPrefix(plaintext: string): string {
  return plaintext.slice(0, 12);
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateServiceAccountSecret(): string {
  return `sa_${randomBytes(32).toString("base64url")}`;
}

export function hashServiceAccountSecret(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}
