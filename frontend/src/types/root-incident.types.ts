import type { Incident } from "./incident.types";

export interface RootIncident {
  id: string;
  title: string;
  causeCheckType: string;
  startedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  affectedProjectIds: string[];
  incidents: Incident[];
}
