// Phase 15 "Multi-Tenant Architektur". Erweitert das bestehende
// project_members.role_id-Rollensystem (Phase 9/10, roles-Tabelle) um eine
// zweite, unabhaengige Dimension auf Organisations-/Team-Ebene - ersetzt es
// nicht.
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

export interface OrganizationMember {
  id: number;
  organizationId: string;
  userId: string;
  roleId: OrganizationRoleId;
  createdAt: string;
}

export interface OrganizationMemberWithUser extends OrganizationMember {
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
  ownerId?: string;
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
