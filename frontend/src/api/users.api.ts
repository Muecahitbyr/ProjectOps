import { apiClient } from "./client";
import type { Role, UserWithPresence } from "../types/user.types";

export async function fetchUsers(): Promise<UserWithPresence[]> {
  const { data } = await apiClient.get<UserWithPresence[]>("/api/users");
  return data;
}

export async function fetchUser(userId: string): Promise<UserWithPresence> {
  const { data } = await apiClient.get<UserWithPresence>(`/api/users/${userId}`);
  return data;
}

export async function fetchRoles(): Promise<Role[]> {
  const { data } = await apiClient.get<Role[]>("/api/roles");
  return data;
}

export interface CreateUserInput {
  name: string;
  email: string;
  avatar?: string;
}

export async function createUser(input: CreateUserInput): Promise<UserWithPresence> {
  const { data } = await apiClient.post<UserWithPresence>("/api/users", input);
  return data;
}
