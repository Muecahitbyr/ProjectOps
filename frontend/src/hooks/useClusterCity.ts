import { useEffect, useRef, useState } from "react";
import { useClusterHealth, useFailoverHistory } from "./useCluster";
import { useMonitoringAgents } from "./useMonitoringAgents";
import { useRollingUpdates } from "./useRollingUpdates";
import { subscribeRealtimeEvents } from "../realtime/realtimeClient";
import { mapClusterToCity } from "../utils/clusterCityMapper";
import type { ObservabilityCityBuildingData } from "../types/observability-city.types";

export interface UseClusterCityResult {
  buildings: ObservabilityCityBuildingData[];
  isLoading: boolean;
  isError: boolean;
}

// Separater Hook (analog zu useAutomationCity.ts/useObservabilityCity.ts,
// Phase 11/13) - eigenstaendige Datenquelle (Cluster Health/Agents/Rolling
// Updates/Failover-Historie), additiv in CityView.tsx gerendert. Phase 14
// Teil 12 "Mini City Erweiterung".
export function useClusterCity(): UseClusterCityResult {
  const healthQuery = useClusterHealth();
  const agentsQuery = useMonitoringAgents();
  const rollingUpdatesQuery = useRollingUpdates();
  const failoverHistoryQuery = useFailoverHistory(20);

  // "Scheduler laeuft gerade"/"Failover laeuft gerade" sind kurze,
  // reale Zeitfenster ab dem echten CHECK_REASSIGNED-/FAILOVER_STARTED-
  // Event (analog zu isBackupInProgress in useObservabilityCity.ts,
  // Phase 13) - kein erfundener Dauerzustand.
  const [isSchedulerActive, setIsSchedulerActive] = useState(false);
  const [isFailoverActive, setIsFailoverActive] = useState(false);
  const schedulerTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const SCHEDULER_PULSE_MS = 3_000;
    const unsubscribe = subscribeRealtimeEvents((event) => {
      if (event.type === "CHECK_REASSIGNED") {
        setIsSchedulerActive(true);
        clearTimeout(schedulerTimeoutRef.current);
        schedulerTimeoutRef.current = setTimeout(() => setIsSchedulerActive(false), SCHEDULER_PULSE_MS);
      } else if (event.type === "FAILOVER_STARTED") {
        setIsFailoverActive(true);
      } else if (event.type === "FAILOVER_FINISHED") {
        setIsFailoverActive(false);
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(schedulerTimeoutRef.current);
    };
  }, []);

  const isLoading = healthQuery.isLoading || agentsQuery.isLoading;
  const isError = healthQuery.isError || agentsQuery.isError;

  const buildings = mapClusterToCity({
    health: healthQuery.data,
    agents: agentsQuery.data ?? [],
    rollingUpdates: rollingUpdatesQuery.data ?? [],
    failoverHistory: failoverHistoryQuery.data ?? [],
    isSchedulerActive,
    isFailoverActive,
  });

  return { buildings, isLoading, isError };
}
