export interface MaintenanceWindow {
  id: string;
  projectId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  createdBy: string | null;
  createdAt: string;
  active: boolean;
  // Phase 28 "Enterprise Maintenance Windows, Change Management &
  // Deployment Risk" - gesetzt, wenn dieses Fenster automatisch beim Start
  // eines Change erzeugt wurde (siehe core/change-lifecycle.ts im Backend).
  changeId: number | null;
}

export interface CreateMaintenanceWindowInput {
  projectId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  createdBy?: string;
}
