// Refresh-Intervalle fuer React Query (in ms) - zentral, damit keine
// Magic Numbers in den Hooks verstreut sind.
export const REFRESH_INTERVAL_DASHBOARD_MS = 30_000;
export const REFRESH_INTERVAL_EVENTS_MS = 15_000;
export const REFRESH_INTERVAL_TIMELINE_MS = 60_000;
export const REFRESH_INTERVAL_PROJECTS_MS = 30_000;
export const REFRESH_INTERVAL_INCIDENTS_MS = 30_000;
export const REFRESH_INTERVAL_USERS_MS = 30_000;
export const REFRESH_INTERVAL_ALERTS_MS = 30_000;
export const REFRESH_INTERVAL_MAINTENANCE_MS = 30_000;
// Phase 13: Agenten-Heartbeat/Backup-/Audit-Listen sind ueber Realtime-
// Events (AGENT_*, BACKUP_*, RESTORE_*, AUDIT_CREATED) event-getrieben -
// dieses Intervall ist nur das Sicherheitsnetz, kein primaerer Mechanismus
// (dieselbe Rolle wie REFRESH_INTERVAL_PROJECTS_MS etc. oben).
export const REFRESH_INTERVAL_AGENTS_MS = 30_000;
export const REFRESH_INTERVAL_BACKUPS_MS = 30_000;
export const REFRESH_INTERVAL_AUDIT_MS = 30_000;
// Diagnostics/Disaster Recovery spiegeln den lebenden Prozesszustand
// (Speicher/CPU/Uptime aendern sich unabhaengig von jedem Realtime-Event) -
// wie useBackendHealth.ts bewusst per Polling, kein Event bildet "der
// Prozess laeuft seit X Sekunden" ab.
export const REFRESH_INTERVAL_DIAGNOSTICS_MS = 15_000;
export const REFRESH_INTERVAL_DISASTER_RECOVERY_MS = 15_000;

export const DEFAULT_EVENTS_LIMIT = 20;
export const DEFAULT_TIMELINE_HOURS = 24;
