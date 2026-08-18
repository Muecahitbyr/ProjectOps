export interface MaintenanceWindow {
  id: number;
  projectId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  createdBy: string | null;
  createdAt: string;
  // Abgeleitet (nicht gespeichert): ob "jetzt" innerhalb [startsAt, endsAt) liegt.
  active: boolean;
  // Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
  // Risk" - rein informativ, welcher Change (falls ueberhaupt) dieses
  // Fenster automatisch erzeugt hat (core/change-lifecycle.ts). NULL fuer
  // manuell angelegte Fenster (unveraendertes Verhalten seit Phase 9).
  changeId: number | null;
}

export interface CreateMaintenanceWindowInput {
  projectId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  createdBy?: string;
  changeId?: number;
}
