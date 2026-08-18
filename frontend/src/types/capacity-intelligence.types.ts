// Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence".
// Spiegelt src/types/capacity-intelligence.types.ts im Backend.
import type { ResilienceSignal, ResilienceStatus } from "./resilience.types";

export interface CapacityWatchlistEntry {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  resilienceStatus: ResilienceStatus;
  capacitySignals: ResilienceSignal[];
  blastRadius: number;
  isPotentialSpof: boolean;
  dependentCount: number;
  // Phase 54 "Enterprise Predictive Operations & Risk Prevention".
  dependencyRiskScore: number;
}

export interface CapacityWatchlist {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  candidatesEvaluated: number;
  entries: CapacityWatchlistEntry[];
}
