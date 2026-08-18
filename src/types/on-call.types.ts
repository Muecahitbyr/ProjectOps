// Phase 24 "Enterprise On-Call Scheduling & Escalation Routing".
// Spiegelt db/migrations/0046_on_call_scheduling.sql.

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

export interface OnCallScheduleMember {
  id: number;
  scheduleId: number;
  userId: string;
  position: number;
  createdAt: string;
}

export interface OnCallScheduleMemberWithUser extends OnCallScheduleMember {
  userName: string;
  userEmail: string;
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

export interface OnCallOverrideWithUser extends OnCallOverride {
  userName: string;
  userEmail: string;
}

// Auftragspunkt "wer ist gerade dran" - Ergebnis von core/on-call.ts#resolveCurrentOnCall,
// nie persistiert (siehe Migrationskommentar: bewusst KEINE "on_call_shifts"-
// Tabelle, vollstaendig aus rotation_start/shift_length_hours/Teilnehmerliste
// bzw. einem aktiven Override abgeleitet).
export interface CurrentOnCall {
  scheduleId: number;
  userId: string | null;
  source: "OVERRIDE" | "ROTATION" | "NONE";
  overrideId: number | null;
  shiftStartsAt: string | null;
  shiftEndsAt: string | null;
}

export interface CurrentOnCallWithUser extends CurrentOnCall {
  userName: string | null;
  userEmail: string | null;
}

// Ein einzelner, zukuenftig anstehender Rotationsabschnitt fuer die
// Timeline-/Kalenderansicht (frontend/src/pages/OnCall.tsx) - reine
// Berechnung, keine eigene Tabelle (vgl. CurrentOnCall oben).
export interface OnCallTimelineEntry {
  userId: string;
  startsAt: string;
  endsAt: string;
  source: "OVERRIDE" | "ROTATION";
  overrideId: number | null;
}
