export interface ApiKey {
  id: string;
  organizationId: string;
  // Phase 16 Auftragspunkt 10 "optional Team zuordnen" - null = weiterhin
  // organisationsweiter Zugriff (Verhalten aus Phase 15 unveraendert).
  teamId: string | null;
  description: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdBy: string | null;
  revokedAt: string | null;
  // Phase 20 Auftragspunkt 1 "API Key Lifecycle" (Migration 0039) - wer den
  // Key widerrufen hat, getrennt von createdBy. Bleibt null, wenn der Key
  // ueber die externe API von einem ANDEREN API-Key widerrufen wurde (keine
  // Benutzer-Identitaet vorhanden) - siehe stattdessen actorApiKeyId in den
  // Audit-Metadaten der externen Route (routes/v1/api-keys.routes.ts).
  revokedBy: string | null;
  createdAt: string;
}

// Phase 20 Auftragspunkt 1 "API Key Lifecycle" - "Status soll nicht
// redundant gespeichert werden, wenn er sauber aus vorhandenen Feldern
// abgeleitet werden kann": ACTIVE/EXPIRED/REVOKED ergeben sich vollstaendig
// aus revokedAt/expiresAt, daher eine reine Ableitungsfunktion statt einer
// zusaetzlichen DB-Spalte. REVOKED hat Vorrang vor EXPIRED (ein Key kann
// beides "sein" - z.B. nach Ablauf explizit widerrufen -, aber REVOKED ist
// die staerkere, absichtlichere Aussage und darf nie durch eine
// abgelaufene-aber-nicht-widerrufene Ansicht verdeckt werden). "Ein Key
// darf niemals wieder aktiviert werden, wenn er explizit revoked wurde" ist
// dadurch strukturell garantiert: revokedAt wird nirgends zurueckgesetzt
// (siehe revokeApiKey() im Repository), also kann der abgeleitete Status
// nie von REVOKED zurueck zu ACTIVE wechseln.
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
  createdBy?: string;
}

export interface CreateApiKeyResult {
  apiKey: ApiKey;
  plaintextKey: string;
}
