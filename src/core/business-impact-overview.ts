// Phase 47 "Enterprise Business Impact & Service Criticality Intelligence" -
// org-weite Priorisierung nach Business Impact statt nach reiner
// technischer Schwere. Dasselbe bounded Top-N-Muster wie
// core/operational-priority.ts (Phase 43) und core/capacity-intelligence.ts
// (Phase 46): guenstiger Vorfilter ueber ALLE Projekte (nicht nur nicht-
// gesunde, da ein aktuell HEALTHY Root mit einem betroffenen CRITICAL-Tier
// Dependenten trotzdem SEVERE sein kann), dann teure Detail-/Impact-Abfrage
// nur fuer die Top-N Kandidaten.
// Bewusst eine eigene Datei getrennt von core/business-impact.ts (das
// service-resilience.ts INTERN fuer computeServiceBusinessImpact()
// importiert) - diese Datei importiert umgekehrt service-resilience.ts, eine
// gemeinsame Datei fuer beide Richtungen wuerde eine zyklische
// Modulabhaengigkeit erzeugen.
import { buildResilienceOverview, buildServiceResilienceDetail } from "./service-resilience";
import type { BusinessImpactOverview, BusinessImpactOverviewEntry, BusinessImpactTier } from "../types/business-impact.types";

export interface BusinessImpactOverviewFilter {
  organizationId: string;
  hours: number;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const TIER_SORT_RANK: Record<BusinessImpactTier, number> = { SEVERE: 5, HIGH: 4, MODERATE: 3, LOW: 2, UNKNOWN: 1, NONE: 0 };

export async function buildBusinessImpactOverview(filter: BusinessImpactOverviewFilter): Promise<BusinessImpactOverview> {
  const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const overview = await buildResilienceOverview({ organizationId: filter.organizationId, hours: filter.hours });

  // Derselbe guenstige Vorfilter wie Phase 46 (nur Projekte mit Messdaten -
  // ohne Service/ohne Checks kann kein Business Impact aus TECHNISCHEN
  // Signalen abgeleitet werden), zusaetzlich priorisiert nach bereits
  // vorhandenen Feldern (recurringIncidentCount/errorBudgetRisk/
  // isPotentialSpof/blastRadius), die grob mit "lohnt sich eine teure
  // Impact-Pruefung" korrelieren.
  const candidates = overview.rows
    .filter((row) => row.healthStatus !== "UNKNOWN")
    .map((row) => ({
      row,
      score: row.recurringIncidentCount * 10 + row.openCriticalProblems * 8 + (row.errorBudgetRisk ? 15 : 0) + (row.isPotentialSpof ? 10 : 0) + Math.min(row.blastRadius, 20) + row.highCriticalCount,
    }))
    .sort((a, b) => b.score - a.score || a.row.projectId.localeCompare(b.row.projectId))
    .slice(0, limit);

  const details = await Promise.all(candidates.map((c) => buildServiceResilienceDetail(c.row.projectId, filter.hours)));

  const entries: BusinessImpactOverviewEntry[] = [];
  candidates.forEach((c, index) => {
    const detail = details[index];
    if (!detail) return;
    entries.push({
      projectId: c.row.projectId,
      projectName: c.row.projectName,
      serviceId: c.row.serviceId,
      serviceName: c.row.serviceName,
      resilienceStatus: c.row.resilienceStatus,
      businessImpact: detail.businessImpact,
    });
  });

  entries.sort((a, b) => TIER_SORT_RANK[b.businessImpact.tier] - TIER_SORT_RANK[a.businessImpact.tier] || a.projectId.localeCompare(b.projectId));

  return {
    organizationId: filter.organizationId,
    windowHours: filter.hours,
    generatedAt: new Date().toISOString(),
    candidatesEvaluated: candidates.length,
    entries,
  };
}
