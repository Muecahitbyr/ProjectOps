export type RoleId = "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER";

export interface Role {
  id: RoleId;
  description: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPresence {
  online: boolean;
  lastActiveAt: string | null;
}

export interface UserProjectMembership {
  projectId: string;
  projectName: string;
  roleId: RoleId;
}

export interface UserWithPresence extends User {
  presence: UserPresence;
  projects: UserProjectMembership[];
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  roleId: RoleId;
  createdAt: string;
  user: User;
}
