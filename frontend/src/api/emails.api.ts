import { apiClient } from "./client";
import type { Email } from "../types/email.types";

export async function fetchEmails(limit = 50): Promise<Email[]> {
  const { data } = await apiClient.get<Email[]>("/api/emails", { params: { limit } });
  return data;
}

export async function markEmailRead(id: number, read: boolean): Promise<Email> {
  const { data } = await apiClient.patch<Email>(`/api/emails/${id}/read`, { read });
  return data;
}
