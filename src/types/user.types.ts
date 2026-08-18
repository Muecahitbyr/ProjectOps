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

export interface ProjectMember {
  id: number;
  projectId: string;
  userId: string;
  roleId: RoleId;
  createdAt: string;
}

export interface ProjectMemberWithUser extends ProjectMember {
  user: User;
}

// Live-Praesenz (realtime/presence.ts) - nicht in der users-Tabelle
// gespeichert, siehe Architekturentscheidungen im Abschlussbericht.
export interface UserPresence {
  online: boolean;
  lastActiveAt: string | null;
}

export interface UserWithPresence extends User {
  presence: UserPresence;
  projects: Array<{ projectId: string; projectName: string; roleId: RoleId }>;
}
