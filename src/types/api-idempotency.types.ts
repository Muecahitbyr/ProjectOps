// Phase 17 Auftragspunkt 4 "Idempotency-Datenbank".
export type IdempotencyStatus = "IN_PROGRESS" | "COMPLETED";

export interface IdempotencyRecord {
  id: string;
  organizationId: string;
  apiKeyId: string;
  idempotencyKey: string;
  requestHash: string;
  endpoint: string;
  method: string;
  status: IdempotencyStatus;
  responseStatus: number | null;
  responseBody: unknown;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
}

export interface ClaimIdempotencyKeyInput {
  organizationId: string;
  apiKeyId: string;
  idempotencyKey: string;
  requestHash: string;
  endpoint: string;
  method: string;
}
