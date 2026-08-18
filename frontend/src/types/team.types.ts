import type { OrganizationRoleId } from "./organization.types";

export interface Team {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberWithUser {
  id: number;
  teamId: string;
  userId: string;
  roleId: OrganizationRoleId;
  createdAt: string;
  userName: string;
  userEmail: string;
}

export interface TeamNotificationSetting {
  id: number;
  teamId: string;
  channelId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
