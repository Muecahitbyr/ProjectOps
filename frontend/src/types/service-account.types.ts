export type ServiceAccountStatus = "ACTIVE" | "REVOKED";

export interface ServiceAccount {
  id: string;
  organizationId: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
  status: ServiceAccountStatus;
  secretRotatedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CreateServiceAccountResult {
  serviceAccount: ServiceAccount;
  plaintextSecret: string;
}
