import { pool } from "./pool";
import { countDeliveriesByStatus } from "./webhooks.repository";
import type { PlatformOverview } from "../types/platform.types";

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const [orgCounts, teamCount, apiKeyCount, serviceAccountCount, webhookCount, apiUsageTotal, pendingDeliveries, deadLetterDeliveries] = await Promise.all([
    pool.query<{ total: string; active: string }>(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active FROM organizations`,
    ),
    pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM teams`),
    pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM api_keys WHERE revoked_at IS NULL`),
    pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM service_accounts WHERE status = 'ACTIVE'`),
    pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM webhooks WHERE enabled = true`),
    pool.query<{ total: string | null }>(`SELECT COALESCE(SUM(usage_count), 0) AS total FROM api_keys`),
    countDeliveriesByStatus("PENDING"),
    countDeliveriesByStatus("DEAD_LETTER"),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    organizationCount: Number(orgCounts.rows[0]?.total ?? 0),
    activeOrganizationCount: Number(orgCounts.rows[0]?.active ?? 0),
    teamCount: Number(teamCount.rows[0]?.count ?? 0),
    apiKeyCount: Number(apiKeyCount.rows[0]?.count ?? 0),
    serviceAccountCount: Number(serviceAccountCount.rows[0]?.count ?? 0),
    webhookCount: Number(webhookCount.rows[0]?.count ?? 0),
    totalApiUsageCount: Number(apiUsageTotal.rows[0]?.total ?? 0),
    pendingWebhookDeliveries: pendingDeliveries,
    deadLetterWebhookDeliveries: deadLetterDeliveries,
  };
}
