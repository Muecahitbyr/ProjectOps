import { apiClient } from "./client";
import type { AuditCategory, AuditLogEntry, AuditSeverity } from "../types/audit.types";

export interface AuditLogQuery {
  userId?: string;
  projectId?: string;
  category?: AuditCategory;
  severity?: AuditSeverity;
  from?: string;
  to?: string;
  limit?: number;
}

export async function fetchAuditLog(query: AuditLogQuery): Promise<AuditLogEntry[]> {
  const { data } = await apiClient.get<AuditLogEntry[]>("/api/audit-log", { params: query });
  return data;
}
