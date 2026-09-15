import { apiClient } from "./client";
import type { CreateNisanGuestInput, NisanGuest, UpdateNisanGuestInput } from "../types/nisan.types";

export async function fetchNisanGuests(): Promise<NisanGuest[]> {
  const { data } = await apiClient.get<NisanGuest[]>("/api/nisan-guests");
  return data;
}

export async function createNisanGuest(input: CreateNisanGuestInput): Promise<NisanGuest> {
  const { data } = await apiClient.post<NisanGuest>("/api/nisan-guests", input);
  return data;
}

export async function updateNisanGuest(id: number, input: UpdateNisanGuestInput): Promise<NisanGuest> {
  const { data } = await apiClient.patch<NisanGuest>(`/api/nisan-guests/${id}`, input);
  return data;
}

export async function deleteNisanGuest(id: number): Promise<void> {
  await apiClient.delete(`/api/nisan-guests/${id}`);
}
