// Spiegelt src/types/platform.types.ts im Backend.
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
