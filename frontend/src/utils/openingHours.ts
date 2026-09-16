// Oeffnungszeiten vom Scraper (Nutzerwunsch 2026-09-16: "wann kann ich
// ueberhaupt anrufen") - rohes JSON wie {"Montag":["09:00–18:00"],
// "Sonntag":["Geschlossen"]} (deutsche Wochentage, Bindestrich ist ein
// En-Dash "–", nicht "-" - beide werden hier toleriert).
export type OpeningHoursMap = Record<string, string[]>;

const GERMAN_DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export function parseOpeningHours(raw: string | null | undefined): OpeningHoursMap | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as OpeningHoursMap;
  } catch {
    return null;
  }
}

function currentGermanWeekday(): string {
  const day = new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "Europe/Berlin" }).format(new Date());
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function currentBerlinTime(): string {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Berlin" }).format(new Date());
}

function isClosedRanges(ranges: string[]): boolean {
  return ranges.length === 0 || ranges.some((r) => /geschlossen|closed/i.test(r));
}

export interface OpenNowStatus {
  isOpen: boolean;
  todayLabel: string;
  todayRanges: string[];
}

// Vergleicht die aktuelle Berlin-Uhrzeit gegen die Zeitraeume des heutigen
// Wochentags ("HH:MM"-Strings vergleichen sich lexikographisch korrekt wie
// numerisch, da fest zweistellig formatiert).
export function getOpenNowStatus(hours: OpeningHoursMap): OpenNowStatus {
  const todayLabel = currentGermanWeekday();
  const todayRanges = hours[todayLabel] ?? [];
  if (isClosedRanges(todayRanges)) {
    return { isOpen: false, todayLabel, todayRanges };
  }
  const now = currentBerlinTime();
  const isOpen = todayRanges.some((range) => {
    const [start, end] = range.split(/[–-]/).map((s) => s.trim());
    return !!start && !!end && now >= start && now <= end;
  });
  return { isOpen, todayLabel, todayRanges };
}

export function formatTodayRanges(ranges: string[]): string {
  if (isClosedRanges(ranges)) return "Geschlossen";
  return ranges.join(", ");
}

export interface WeekDayHours {
  day: string;
  text: string;
}

// Fuer die Wochenansicht (Klick-Popover) - alle 7 Tage in fester
// Reihenfolge, unabhaengig von der Reihenfolge im JSON. Tag getrennt vom
// Text zurueckgegeben, damit die Anzeige den heutigen Tag hervorheben kann.
export function formatFullWeek(hours: OpeningHoursMap): WeekDayHours[] {
  return GERMAN_DAYS.filter((day) => hours[day] !== undefined).map((day) => ({ day, text: formatTodayRanges(hours[day]!) }));
}
