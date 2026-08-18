import type { OnCallOverride, OnCallSchedule, OnCallScheduleMember, CurrentOnCall, OnCallTimelineEntry } from "../types/on-call.types";

// Phase 24 "Enterprise On-Call Scheduling & Escalation Routing". Reine,
// DB-lose Funktionen (kein pool.query hier) - derselbe Grundsatz wie
// core/error-budget.ts (Phase 22) / types/api-key.types.ts#deriveApiKeyStatus
// (Phase 20): "wer ist gerade dran" wird IMMER live aus rotation_start +
// shift_length_hours + geordneter Teilnehmerliste (plus einem eventuell
// aktiven Override) berechnet, nie als eigene "aktuelle Schicht"-Zeile
// gespeichert - vermeidet sowohl staendige Hintergrund-Jobs als auch
// veraltete/falsche gespeicherte Zustaende.

function shiftLengthMs(schedule: Pick<OnCallSchedule, "shiftLengthHours">): number {
  return schedule.shiftLengthHours * 60 * 60 * 1000;
}

// Findet den Rotationsteilnehmer, der zum Zeitpunkt `now` gemaess reiner
// Rundlauf-Rotation dran waere - IGNORIERT Overrides (siehe
// resolveCurrentOnCall() unten fuer die override-bewusste Variante).
// members MUSS bereits nach position aufsteigend sortiert sein (siehe
// db/on-call.repository.ts#listScheduleMembers, ORDER BY position).
export function resolveScheduledShift(
  schedule: Pick<OnCallSchedule, "rotationStart" | "shiftLengthHours">,
  members: Pick<OnCallScheduleMember, "userId">[],
  now: Date,
): { userId: string; shiftStartsAt: Date; shiftEndsAt: Date } | null {
  if (members.length === 0) return null;
  const rotationStart = new Date(schedule.rotationStart);
  if (now < rotationStart) return null;

  const shiftMs = shiftLengthMs(schedule);
  const elapsedMs = now.getTime() - rotationStart.getTime();
  const shiftIndex = Math.floor(elapsedMs / shiftMs);
  const memberIndex = shiftIndex % members.length;
  const member = members[memberIndex];
  if (!member) return null;

  const shiftStartsAt = new Date(rotationStart.getTime() + shiftIndex * shiftMs);
  const shiftEndsAt = new Date(shiftStartsAt.getTime() + shiftMs);
  return { userId: member.userId, shiftStartsAt, shiftEndsAt };
}

function findActiveOverride(overrides: OnCallOverride[], now: Date): OnCallOverride | undefined {
  // Ueberlappende Overrides fuer dasselbe Schedule werden bereits beim
  // Anlegen race-sicher verhindert (db/on-call.repository.ts#createOverrideIfNoOverlap)
  // - "erstes Match" ist damit im Normalfall eindeutig; als Verteidigung in
  // der Tiefe (z.B. direkt in der DB manuell eingefuegte Daten) wird bei
  // mehreren Treffern der zuletzt ERSTELLTE bevorzugt (juengste Entscheidung
  // gewinnt).
  const active = overrides.filter((o) => new Date(o.startsAt) <= now && now < new Date(o.endsAt));
  if (active.length === 0) return undefined;
  return active.reduce((latest, current) => (new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest));
}

// Override-bewusste Version: ein aktiver Override fuer `now` gewinnt immer
// gegenueber der berechneten Rotation.
export function resolveCurrentOnCall(
  scheduleId: number,
  schedule: Pick<OnCallSchedule, "rotationStart" | "shiftLengthHours">,
  members: Pick<OnCallScheduleMember, "userId">[],
  overrides: OnCallOverride[],
  now: Date,
): CurrentOnCall {
  const activeOverride = findActiveOverride(overrides, now);
  if (activeOverride) {
    return {
      scheduleId,
      userId: activeOverride.userId,
      source: "OVERRIDE",
      overrideId: activeOverride.id,
      shiftStartsAt: activeOverride.startsAt,
      shiftEndsAt: activeOverride.endsAt,
    };
  }

  const scheduled = resolveScheduledShift(schedule, members, now);
  if (!scheduled) {
    return { scheduleId, userId: null, source: "NONE", overrideId: null, shiftStartsAt: null, shiftEndsAt: null };
  }
  return {
    scheduleId,
    userId: scheduled.userId,
    source: "ROTATION",
    overrideId: null,
    shiftStartsAt: scheduled.shiftStartsAt.toISOString(),
    shiftEndsAt: scheduled.shiftEndsAt.toISOString(),
  };
}

// Baut eine zusammenhaengende Timeline fuer [from, to) fuer die Kalender-/
// Vorschau-Ansicht (frontend/src/pages/OnCall.tsx): sammelt alle
// Rotations- UND Override-Grenzen im Fenster, loest an jeder resultierenden
// Teilspanne den Diensthabenden per resolveCurrentOnCall() auf und fasst
// direkt aufeinanderfolgende Spannen mit demselben Nutzer/derselben Quelle
// wieder zusammen. Robuster als manuelles Aufspalten von Rotations- an
// Override-Grenzen (mehrere ueberlappende Grenzen wuerden das schnell
// fehleranfaellig machen) und bei den ueblichen Groessenordnungen (wenige
// Teilnehmer, wenige Overrides pro Fenster) guenstig genug.
export function buildOnCallTimeline(
  scheduleId: number,
  schedule: Pick<OnCallSchedule, "rotationStart" | "shiftLengthHours">,
  members: Pick<OnCallScheduleMember, "userId">[],
  overrides: OnCallOverride[],
  from: Date,
  to: Date,
): OnCallTimelineEntry[] {
  if (members.length === 0 || from >= to) return [];

  const boundaries = new Set<number>([from.getTime(), to.getTime()]);
  const shiftMs = shiftLengthMs(schedule);
  const rotationStart = new Date(schedule.rotationStart);
  if (shiftMs > 0) {
    const firstIndex = Math.max(0, Math.floor((from.getTime() - rotationStart.getTime()) / shiftMs) - 1);
    let t = rotationStart.getTime() + firstIndex * shiftMs;
    // Schutz gegen Endlosschleifen bei extremen Fenstern (z.B. 400 Tage
    // Fenster mit 1h-Schichten waeren >9000 Iterationen) - Timeline-Anfragen
    // sind ueber die Route auf sinnvolle Fenster begrenzt (siehe
    // routes/on-call.routes.ts).
    let guard = 0;
    while (t < to.getTime() && guard < 20_000) {
      if (t > from.getTime() && t < to.getTime()) boundaries.add(t);
      t += shiftMs;
      guard += 1;
    }
  }
  for (const override of overrides) {
    const start = new Date(override.startsAt).getTime();
    const end = new Date(override.endsAt).getTime();
    if (start > from.getTime() && start < to.getTime()) boundaries.add(start);
    if (end > from.getTime() && end < to.getTime()) boundaries.add(end);
  }

  const sorted = [...boundaries].sort((a, b) => a - b);
  const raw: OnCallTimelineEntry[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    if (segStart === undefined || segEnd === undefined || segStart >= segEnd) continue;
    const resolved = resolveCurrentOnCall(scheduleId, schedule, members, overrides, new Date(segStart));
    if (!resolved.userId) continue;
    raw.push({
      userId: resolved.userId,
      startsAt: new Date(segStart).toISOString(),
      endsAt: new Date(segEnd).toISOString(),
      source: resolved.source === "OVERRIDE" ? "OVERRIDE" : "ROTATION",
      overrideId: resolved.overrideId,
    });
  }

  const merged: OnCallTimelineEntry[] = [];
  for (const entry of raw) {
    const last = merged[merged.length - 1];
    if (last && last.userId === entry.userId && last.source === entry.source && last.overrideId === entry.overrideId && last.endsAt === entry.startsAt) {
      last.endsAt = entry.endsAt;
    } else {
      merged.push({ ...entry });
    }
  }
  return merged;
}
