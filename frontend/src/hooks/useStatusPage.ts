import { useQuery } from "@tanstack/react-query";
import { fetchPublicStatusHistory, fetchPublicStatusPage } from "../api/status-page.api";
import { queryKeys } from "./queryKeys";

// Oeffentliche Status-Seite (kein Login) - kein useRealtime()-Invalidierung
// noetig, da die Seite nicht innerhalb von PageContainer laeuft (siehe
// pages/StatusPage.tsx); Polling reicht fuer diesen ausschliesslich
// lesenden, oeffentlichen Anwendungsfall.
const PUBLIC_STATUS_REFRESH_MS = 30_000;

export function usePublicStatusPage() {
  return useQuery({
    queryKey: queryKeys.publicStatusPage,
    queryFn: fetchPublicStatusPage,
    refetchInterval: PUBLIC_STATUS_REFRESH_MS,
  });
}

export function usePublicStatusHistory(projectId: string | undefined, days: number) {
  return useQuery({
    queryKey: queryKeys.publicStatusHistory(projectId ?? "", days),
    queryFn: () => fetchPublicStatusHistory(projectId!, days),
    enabled: Boolean(projectId),
  });
}
