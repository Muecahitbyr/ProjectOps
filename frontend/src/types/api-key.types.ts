export interface ApiKey {
  id: string;
  organizationId: string;
  teamId: string | null;
  description: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdBy: string | null;
  revokedAt: string | null;
  // Phase 20 "Enterprise API Governance, Developer Portal & Credential
  // Lifecycle" Auftragspunkt 1 (Migration 0039).
  revokedBy: string | null;
  createdAt: string;
}

// Spiegelt deriveApiKeyStatus() im Backend (types/api-key.types.ts) - eine
// reine Ableitung aus revokedAt/expiresAt, keine eigene gespeicherte Spalte.
// REVOKED hat Vorrang vor EXPIRED: ein widerrufener Key bleibt immer
// REVOKED, unabhaengig vom Ablaufdatum.
export type ApiKeyStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export function deriveApiKeyStatus(key: Pick<ApiKey, "revokedAt" | "expiresAt">): ApiKeyStatus {
  if (key.revokedAt !== null) return "REVOKED";
  if (key.expiresAt !== null && new Date(key.expiresAt).getTime() <= Date.now()) return "EXPIRED";
  return "ACTIVE";
}

export interface CreateApiKeyInput {
  organizationId: string;
  teamId?: string;
  description: string;
  scopes?: string[];
  expiresAt?: string;
}

export interface CreateApiKeyResult {
  apiKey: ApiKey;
  plaintextKey: string;
}
