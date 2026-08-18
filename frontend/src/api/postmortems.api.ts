import { apiClient } from "./client";
import type { PostmortemActionItem, PostmortemStatus, PostmortemWithActionItems } from "../types/postmortem.types";

export interface PostmortemsQuery {
  status?: PostmortemStatus;
  limit?: number;
}

export async function fetchPostmortems(query: PostmortemsQuery = {}): Promise<PostmortemWithActionItems[]> {
  const { data } = await apiClient.get<PostmortemWithActionItems[]>("/api/postmortems", { params: query });
  return data;
}

export async function fetchIncidentPostmortem(incidentId: string): Promise<PostmortemWithActionItems> {
  const { data } = await apiClient.get<PostmortemWithActionItems>(`/api/incidents/${incidentId}/postmortem`);
  return data;
}

export interface CreatePostmortemInput {
  summary?: string;
  impact?: string;
  rootCause?: string;
  resolution?: string;
  timelineNotes?: string;
  useTimeline?: boolean;
}

export async function createPostmortem(incidentId: string, input: CreatePostmortemInput): Promise<PostmortemWithActionItems> {
  const { data } = await apiClient.post<PostmortemWithActionItems>(`/api/incidents/${incidentId}/postmortem`, input);
  return data;
}

export interface UpdatePostmortemInput {
  status?: "DRAFT" | "IN_REVIEW";
  summary?: string | null;
  impact?: string | null;
  rootCause?: string | null;
  resolution?: string | null;
  timelineNotes?: string | null;
}

export async function updatePostmortem(incidentId: string, input: UpdatePostmortemInput): Promise<PostmortemWithActionItems> {
  const { data } = await apiClient.patch<PostmortemWithActionItems>(`/api/incidents/${incidentId}/postmortem`, input);
  return data;
}

export async function publishPostmortem(incidentId: string): Promise<PostmortemWithActionItems> {
  const { data } = await apiClient.post<PostmortemWithActionItems>(`/api/incidents/${incidentId}/postmortem/publish`);
  return data;
}

export interface CreateActionItemInput {
  description: string;
  assigneeId?: string;
  dueDate?: string;
}

export async function createActionItem(incidentId: string, input: CreateActionItemInput): Promise<PostmortemActionItem> {
  const { data } = await apiClient.post<PostmortemActionItem>(`/api/incidents/${incidentId}/postmortem/action-items`, input);
  return data;
}

export interface UpdateActionItemInput {
  description?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  status?: "OPEN" | "IN_PROGRESS" | "DONE";
}

export async function updateActionItem(
  incidentId: string,
  itemId: number,
  input: UpdateActionItemInput,
): Promise<PostmortemActionItem> {
  const { data } = await apiClient.patch<PostmortemActionItem>(
    `/api/incidents/${incidentId}/postmortem/action-items/${itemId}`,
    input,
  );
  return data;
}

export async function deleteActionItem(incidentId: string, itemId: number): Promise<void> {
  await apiClient.delete(`/api/incidents/${incidentId}/postmortem/action-items/${itemId}`);
}
