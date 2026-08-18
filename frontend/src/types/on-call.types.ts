// Spiegelt src/types/on-call.types.ts im Backend (Phase 24).

export type OnCallRotationType = "DAILY" | "WEEKLY" | "CUSTOM";

export const ON_CALL_ROTATION_TYPES: OnCallRotationType[] = ["DAILY", "WEEKLY", "CUSTOM"];

export interface OnCallSchedule {
  id: number;
  organizationId: string;
  teamId: string;
  name: string;
  description: string | null;
  timezone: string;
  rotationType: OnCallRotationType;
  shiftLengthHours: number;
  rotationStart: string;
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnCallOverride {
  id: number;
  scheduleId: number;
  userId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface OnCallScheduleMemberWithUser {
  id: number;
  scheduleId: number;
  userId: string;
  position: number;
  createdAt: string;
  userName: string;
  userEmail: string;
}

export interface OnCallOverrideWithUser {
  id: number;
  scheduleId: number;
  userId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
}

export interface CurrentOnCallWithUser {
  scheduleId: number;
  userId: string | null;
  source: "OVERRIDE" | "ROTATION" | "NONE";
  overrideId: number | null;
  shiftStartsAt: string | null;
  shiftEndsAt: string | null;
  userName: string | null;
  userEmail: string | null;
}

export interface OnCallTimelineEntry {
  userId: string;
  startsAt: string;
  endsAt: string;
  source: "OVERRIDE" | "ROTATION";
  overrideId: number | null;
}
