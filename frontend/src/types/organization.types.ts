// Spiegelt src/types/organization.types.ts im Backend.
export type OrganizationRoleId =
  | "PLATFORM_OWNER"
  | "ORGANIZATION_OWNER"
  | "ORGANIZATION_ADMIN"
  | "SECURITY_ADMIN"
  | "BILLING_ADMIN"
  | "DEVELOPER"
  | "OPERATOR"
  | "VIEWER"
  | "SERVICE_ACCOUNT";

export const ORGANIZATION_ROLE_IDS: OrganizationRoleId[] = [
  "PLATFORM_OWNER",
  "ORGANIZATION_OWNER",
  "ORGANIZATION_ADMIN",
  "SECURITY_ADMIN",
  "BILLING_ADMIN",
  "DEVELOPER",
  "OPERATOR",
  "VIEWER",
  "SERVICE_ACCOUNT",
];

export type OrganizationPlan = "FREE" | "PRO" | "ENTERPRISE";
export type OrganizationStatus = "ACTIVE" | "SUSPENDED";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrganizationPlan;
  status: OrganizationStatus;
  ownerId: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  timezone: string;
  language: string;
  region: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMemberWithUser {
  id: number;
  organizationId: string;
  userId: string;
  roleId: OrganizationRoleId;
  createdAt: string;
  userName: string;
  userEmail: string;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  plan?: OrganizationPlan;
  timezone?: string;
  language?: string;
  region?: string;
  brandColor?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  plan?: OrganizationPlan;
  status?: OrganizationStatus;
  timezone?: string;
  language?: string;
  region?: string;
  brandColor?: string;
}
