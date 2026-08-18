// Phase 15 Teil 8/9 "Tenant Analytics"/"Global Administration".
export interface TenantAnalytics {
  organizationId: string;
  organizationName: string;
  projectCount: number;
  incidentCount: number;
  alertCount: number;
  automationExecutionCount: number;
  averageHealthScore: number | null;
  averageResponseTimeMs: number | null;
  notificationCount: number;
  apiUsageCount: number;
  // "Storage" - es gibt kein Datei-/Blob-Speicher-Subsystem in ProjectOps;
  // ehrlich als Anzahl gespeicherter Datensaetze (Checks/Incidents/Audit/
  // Agent-Logs dieser Organisation) ausgewiesen statt einer erfundenen
  // Byte-Groesse.
  recordsStored: number;
}

export interface PlatformOverview {
  generatedAt: string;
  organizationCount: number;
  activeOrganizationCount: number;
  teamCount: number;
  apiKeyCount: number;
  serviceAccountCount: number;
  webhookCount: number;
  totalApiUsageCount: number;
  pendingWebhookDeliveries: number;
  deadLetterWebhookDeliveries: number;
}
