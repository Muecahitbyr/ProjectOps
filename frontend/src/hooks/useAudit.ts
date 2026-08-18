import { useQuery } from "@tanstack/react-query";
import { fetchAuditLog, type AuditLogQuery } from "../api/audit.api";
import { queryKeys } from "./queryKeys";
import { REFRESH_INTERVAL_AUDIT_MS } from "../utils/constants";

export function useAuditLog(query: AuditLogQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.auditLog(query),
    queryFn: () => fetchAuditLog(query),
    refetchInterval: REFRESH_INTERVAL_AUDIT_MS,
    enabled,
  });
}
