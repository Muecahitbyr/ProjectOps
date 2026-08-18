const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export function formatRelativeTime(isoString: string | null): string {
  if (!isoString) {
    return "never";
  }

  const diffSeconds = Math.round((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSeconds < SECONDS_PER_MINUTE) {
    return `${diffSeconds}s ago`;
  }

  const diffMinutes = Math.round(diffSeconds / SECONDS_PER_MINUTE);
  if (diffMinutes < MINUTES_PER_HOUR) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / MINUTES_PER_HOUR);
  if (diffHours < HOURS_PER_DAY) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / HOURS_PER_DAY);
  return `${diffDays}d ago`;
}

export function formatDateTime(isoString: string | null): string {
  if (!isoString) {
    return "-";
  }
  return new Date(isoString).toLocaleString();
}

export function formatResponseTime(ms: number | null): string {
  return ms === null ? "-" : `${ms}ms`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;
const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR;
const MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY;

// Fuer Analytics-Dauern (MTTR/MTBF/Downtime/...) - waehlt die groebste
// sinnvolle Einheit plus einen Nachkommateil (z.B. "2d 4h", "45m 12s"),
// damit sowohl Sekunden- als auch Mehrtages-Werte lesbar bleiben.
export function formatDuration(ms: number | null): string {
  if (ms === null) {
    return "-";
  }
  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < MS_PER_MINUTE) {
    return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
  }
  if (ms < MS_PER_HOUR) {
    const minutes = Math.floor(ms / MS_PER_MINUTE);
    const seconds = Math.round((ms % MS_PER_MINUTE) / MS_PER_SECOND);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  if (ms < MS_PER_DAY) {
    const hours = Math.floor(ms / MS_PER_HOUR);
    const minutes = Math.round((ms % MS_PER_HOUR) / MS_PER_MINUTE);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.round((ms % MS_PER_DAY) / MS_PER_HOUR);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}
