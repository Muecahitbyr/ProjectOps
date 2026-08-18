import { useEffect, useRef, useState } from "react";
import { useMonitoringAgents } from "./useMonitoringAgents";
import { useBackups } from "./useBackups";
import { useAuditLog } from "./useAudit";
import { usePublicStatusPage } from "./useStatusPage";
import { useForecast } from "./useForecast";
import { useAuth } from "../auth/AuthContext";
import { subscribeRealtimeEvents } from "../realtime/realtimeClient";
import { mapObservabilityToCity } from "../utils/observabilityCityMapper";
import type { ObservabilityCityBuildingData } from "../types/observability-city.types";

export interface UseObservabilityCityResult {
  buildings: ObservabilityCityBuildingData[];
  isLoading: boolean;
  isError: boolean;
}

// Separater Hook (analog zu useAutomationCity.ts, Phase 11) - eine
// eigenstaendige Datenquelle (Monitoring Agents/Backups/Audit/Status Page/
// Forecast statt Dashboard/Projekt-Health), die CityView.tsx additiv
// dazu-rendert. Backups/Audit sind serverseitig OWNER/ADMIN-only (siehe
// routes/backups.routes.ts, audit.routes.ts) - fuer alle anderen Benutzer
// bewusst deaktiviert statt einen 403-Request auszuloesen; die betroffenen
// Gebaeude zeigen dann ehrlich "idle" statt erfundener Werte.
export function useObservabilityCity(): UseObservabilityCityResult {
  const { isGlobalAdmin } = useAuth();
  const agentsQuery = useMonitoringAgents();
  const backupsQuery = useBackups(isGlobalAdmin);
  const auditQuery = useAuditLog({ limit: 20 }, isGlobalAdmin);
  const statusPageQuery = usePublicStatusPage();
  const forecastQuery = useForecast("HEALTH_SCORE");

  // Backup/Restore sind kurze, synchrone Ablaeufe (siehe backup-service.ts) -
  // "laeuft gerade" wird daher als kurzes Zeitfenster ab dem echten
  // BACKUP_STARTED/RESTORE_STARTED-Realtime-Event nachgebildet (kein
  // erfundener Dauerzustand, endet spaetestens nach BACKUP_FINISHED/
  // RESTORE_FINISHED oder einem Sicherheits-Timeout).
  const [isBackupInProgress, setIsBackupInProgress] = useState(false);
  const [isRestoreInProgress, setIsRestoreInProgress] = useState(false);
  const backupTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const SAFETY_TIMEOUT_MS = 15_000;
    const unsubscribe = subscribeRealtimeEvents((event) => {
      if (event.type === "BACKUP_STARTED") {
        setIsBackupInProgress(true);
        clearTimeout(backupTimeoutRef.current);
        backupTimeoutRef.current = setTimeout(() => setIsBackupInProgress(false), SAFETY_TIMEOUT_MS);
      } else if (event.type === "BACKUP_FINISHED") {
        setIsBackupInProgress(false);
        clearTimeout(backupTimeoutRef.current);
      } else if (event.type === "RESTORE_STARTED") {
        setIsRestoreInProgress(true);
        clearTimeout(restoreTimeoutRef.current);
        restoreTimeoutRef.current = setTimeout(() => setIsRestoreInProgress(false), SAFETY_TIMEOUT_MS);
      } else if (event.type === "RESTORE_FINISHED") {
        setIsRestoreInProgress(false);
        clearTimeout(restoreTimeoutRef.current);
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(backupTimeoutRef.current);
      clearTimeout(restoreTimeoutRef.current);
    };
  }, []);

  const isLoading = agentsQuery.isLoading || statusPageQuery.isLoading;
  const isError = agentsQuery.isError || statusPageQuery.isError;

  const buildings = mapObservabilityToCity({
    agents: agentsQuery.data ?? [],
    backups: isGlobalAdmin ? backupsQuery.data ?? [] : [],
    auditEntries: isGlobalAdmin ? auditQuery.data ?? [] : [],
    statusPage: statusPageQuery.data,
    healthForecast: forecastQuery.data,
    isForecastLoading: forecastQuery.isLoading,
    isBackupInProgress,
    isRestoreInProgress,
  });

  return { buildings, isLoading, isError };
}
