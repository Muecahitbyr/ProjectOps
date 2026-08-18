import { apiClient } from "./client";
import type { User, UserProjectMembership } from "../types/user.types";

export interface AuthenticatedUser extends User {
  projects: UserProjectMembership[];
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

// Login/Register setzen die Auth-Cookies serverseitig (httpOnly, siehe
// backend config/auth.config.ts) - der Response-Body enthaelt bewusst
// keinen Token, nur das User-Objekt. me() gibt zusaetzlich die
// Projekt-Mitgliedschaften zurueck (fuer Permission Guards, siehe
// auth/AuthContext.tsx).
export async function login(input: LoginInput): Promise<User> {
  const { data } = await apiClient.post<User>("/api/auth/login", input);
  return data;
}

export async function register(input: RegisterInput): Promise<User> {
  const { data } = await apiClient.post<User>("/api/auth/register", input);
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/api/auth/logout");
}

export async function fetchCurrentUser(): Promise<AuthenticatedUser> {
  const { data } = await apiClient.get<AuthenticatedUser>("/api/auth/me");
  return data;
}
