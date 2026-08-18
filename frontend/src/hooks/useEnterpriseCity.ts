import { useEffect, useRef, useState } from "react";
import { usePlatformOverview } from "./usePlatform";
import { useAuth } from "../auth/AuthContext";
import { subscribeRealtimeEvents } from "../realtime/realtimeClient";
import { mapEnterpriseToCity } from "../utils/enterpriseCityMapper";
import type { ObservabilityCityBuildingData } from "../types/observability-city.types";

export interface UseEnterpriseCityResult {
  buildings: ObservabilityCityBuildingData[];
  isLoading: boolean;
  isError: boolean;
}

const PULSE_MS = 3_000;
const QUOTA_ALERT_MS = 30_000;

// Separater Hook (analog zu useClusterCity.ts, Phase 14) - eigenstaendige
// Datenquelle (Platform Overview), additiv in CityView.tsx gerendert. Phase
// 15 Teil 12 "Mini City Erweiterung" (Enterprise District). /api/platform
// ist Platform-Owner-only (mit Fallback auf authorizeGlobalAdmin) - fuer
// alle anderen Benutzer bewusst deaktiviert (siehe usePlatformOverview()),
// die Gebaeude zeigen dann ehrlich "idle" statt eines 403-Requests.
export function useEnterpriseCity(): UseEnterpriseCityResult {
  const { isGlobalAdmin } = useAuth();
  const overviewQuery = usePlatformOverview(isGlobalAdmin);

  // "Tenant Activity"/"Team Collaboration"/"Webhook Queue" sind kurze, reale
  // Zeitfenster ab dem jeweiligen echten Realtime-Event (analog zu
  // isSchedulerActive in useClusterCity.ts) - kein erfundener Dauerzustand.
  const [isTenantActivityPulse, setIsTenantActivityPulse] = useState(false);
  const [isTeamCollaborationPulse, setIsTeamCollaborationPulse] = useState(false);
  const [isWebhookQueuePulse, setIsWebhookQueuePulse] = useState(false);
  const [isQuotaAlert, setIsQuotaAlert] = useState(false);
  const tenantTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const teamTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const webhookTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const quotaAlertTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = subscribeRealtimeEvents((event) => {
      if (event.type === "ORGANIZATION_CREATED" || event.type === "ORGANIZATION_UPDATED" || event.type === "TENANT_UPDATED") {
        setIsTenantActivityPulse(true);
        clearTimeout(tenantTimeoutRef.current);
        tenantTimeoutRef.current = setTimeout(() => setIsTenantActivityPulse(false), PULSE_MS);
      } else if (event.type === "TEAM_CREATED" || event.type === "TEAM_UPDATED") {
        setIsTeamCollaborationPulse(true);
        clearTimeout(teamTimeoutRef.current);
        teamTimeoutRef.current = setTimeout(() => setIsTeamCollaborationPulse(false), PULSE_MS);
      } else if (event.type === "WEBHOOK_DELIVERED" || event.type === "WEBHOOK_FAILED") {
        setIsWebhookQueuePulse(true);
        clearTimeout(webhookTimeoutRef.current);
        webhookTimeoutRef.current = setTimeout(() => setIsWebhookQueuePulse(false), PULSE_MS);
      } else if (event.type === "API_QUOTA_WARNING" || event.type === "API_QUOTA_EXCEEDED") {
        // Phase 16 Auftragspunkt 18 "Mini City" - laenger sichtbares Alert-
        // Fenster (nicht der kurze 3s-Puls oben) fuer die API-Gateway-
        // Kachel: eine Quota-Ueberschreitung ist ein bedeutsamerer,
        // seltenerer Zustand als eine einzelne Aktivitaets-Regung.
        setIsQuotaAlert(true);
        clearTimeout(quotaAlertTimeoutRef.current);
        quotaAlertTimeoutRef.current = setTimeout(() => setIsQuotaAlert(false), QUOTA_ALERT_MS);
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(tenantTimeoutRef.current);
      clearTimeout(teamTimeoutRef.current);
      clearTimeout(webhookTimeoutRef.current);
      clearTimeout(quotaAlertTimeoutRef.current);
    };
  }, []);

  // "API Requests" hat kein eigenes Realtime-Event (recordApiKeyUsage()
  // broadcastet bewusst nicht pro Request, siehe api-keys.repository.ts -
  // das waere Broadcast-Spam bei hoher Request-Rate). Stattdessen ein echter
  // Polling-Diff auf totalApiUsageCount (30s-Intervall, siehe
  // usePlatformOverview()): steigt der Zaehler zwischen zwei Abrufen, gab es
  // echte neue Requests - kein erfundener Dauerzustand.
  const [isApiRequestsPulse, setIsApiRequestsPulse] = useState(false);
  const previousUsageCountRef = useRef<number | undefined>(undefined);
  const apiRequestsTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const currentCount = overviewQuery.data?.totalApiUsageCount;
    if (currentCount === undefined) {
      return;
    }
    if (previousUsageCountRef.current !== undefined && currentCount > previousUsageCountRef.current) {
      setIsApiRequestsPulse(true);
      clearTimeout(apiRequestsTimeoutRef.current);
      apiRequestsTimeoutRef.current = setTimeout(() => setIsApiRequestsPulse(false), PULSE_MS);
    }
    previousUsageCountRef.current = currentCount;
  }, [overviewQuery.data?.totalApiUsageCount]);

  useEffect(() => {
    return () => clearTimeout(apiRequestsTimeoutRef.current);
  }, []);

  const buildings = mapEnterpriseToCity({
    overview: overviewQuery.data,
    isTenantActivityPulse,
    isTeamCollaborationPulse,
    isApiRequestsPulse,
    isWebhookQueuePulse,
    isQuotaAlert,
  });

  return { buildings, isLoading: overviewQuery.isLoading, isError: overviewQuery.isError };
}
