import { apiClient } from "./client";
import type {
  OnCallSchedule,
  OnCallScheduleMemberWithUser,
  OnCallOverrideWithUser,
  CurrentOnCallWithUser,
  OnCallTimelineEntry,
  OnCallRotationType,
} from "../types/on-call.types";

export interface OnCallSchedulesQuery {
  organizationId?: string;
  teamId?: string;
  enabled?: boolean;
}

export async function fetchOnCallSchedules(query: OnCallSchedulesQuery = {}): Promise<OnCallSchedule[]> {
  const { data } = await apiClient.get<OnCallSchedule[]>("/api/on-call/schedules", {
    params: { ...query, ...(query.enabled !== undefined ? { enabled: String(query.enabled) } : {}) },
  });
  return data;
}

export async function fetchOnCallSchedule(id: string): Promise<OnCallSchedule> {
  const { data } = await apiClient.get<OnCallSchedule>(`/api/on-call/schedules/${id}`);
  return data;
}

export async function fetchOnCallScheduleMembers(id: string): Promise<OnCallScheduleMemberWithUser[]> {
  const { data } = await apiClient.get<OnCallScheduleMemberWithUser[]>(`/api/on-call/schedules/${id}/members`);
  return data;
}

export async function fetchCurrentOnCall(id: string): Promise<CurrentOnCallWithUser> {
  const { data } = await apiClient.get<CurrentOnCallWithUser>(`/api/on-call/schedules/${id}/current`);
  return data;
}

export async function fetchOnCallTimeline(id: string, from?: string, hours?: number): Promise<OnCallTimelineEntry[]> {
  const { data } = await apiClient.get<OnCallTimelineEntry[]>(`/api/on-call/schedules/${id}/timeline`, {
    params: { ...(from ? { from } : {}), ...(hours !== undefined ? { hours } : {}) },
  });
  return data;
}

export async function fetchOnCallOverrides(id: string): Promise<OnCallOverrideWithUser[]> {
  const { data } = await apiClient.get<OnCallOverrideWithUser[]>(`/api/on-call/schedules/${id}/overrides`);
  return data;
}

export interface CreateOnCallScheduleInput {
  organizationId: string;
  teamId: string;
  name: string;
  description?: string;
  timezone?: string;
  rotationType?: OnCallRotationType;
  shiftLengthHours: number;
  rotationStart: string;
  enabled?: boolean;
}

export async function createOnCallSchedule(input: CreateOnCallScheduleInput): Promise<OnCallSchedule> {
  const { data } = await apiClient.post<OnCallSchedule>("/api/on-call/schedules", input);
  return data;
}

export interface UpdateOnCallScheduleInput {
  name?: string;
  description?: string | null;
  timezone?: string;
  rotationType?: OnCallRotationType;
  shiftLengthHours?: number;
  rotationStart?: string;
  enabled?: boolean;
}

export async function updateOnCallSchedule(id: string, input: UpdateOnCallScheduleInput): Promise<OnCallSchedule> {
  const { data } = await apiClient.patch<OnCallSchedule>(`/api/on-call/schedules/${id}`, input);
  return data;
}

export async function deleteOnCallSchedule(id: string): Promise<void> {
  await apiClient.delete(`/api/on-call/schedules/${id}`);
}

export async function replaceOnCallScheduleMembers(id: string, userIds: string[]): Promise<OnCallScheduleMemberWithUser[]> {
  const { data } = await apiClient.put<OnCallScheduleMemberWithUser[]>(`/api/on-call/schedules/${id}/members`, { userIds });
  return data;
}

export interface CreateOnCallOverrideInput {
  userId: string;
  startsAt: string;
  endsAt: string;
  reason?: string;
}

export async function createOnCallOverride(scheduleId: string, input: CreateOnCallOverrideInput): Promise<OnCallOverrideWithUser> {
  const { data } = await apiClient.post<OnCallOverrideWithUser>(`/api/on-call/schedules/${scheduleId}/overrides`, input);
  return data;
}

export async function deleteOnCallOverride(scheduleId: string, overrideId: string): Promise<void> {
  await apiClient.delete(`/api/on-call/schedules/${scheduleId}/overrides/${overrideId}`);
}
