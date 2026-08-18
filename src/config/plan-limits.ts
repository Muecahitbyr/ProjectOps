import type { OrganizationPlan } from "../types/organization.types";

// Phase 16 Auftragspunkt 7 "API Quotas" - zentrale Konfiguration statt an
// mehreren Stellen hardcoded, wie explizit gefordert. Nutzt die bereits in
// Phase 15 vorhandenen OrganizationPlan-Werte (FREE/PRO/ENTERPRISE) - es
// werden hier bewusst KEINE neuen Plaene erfunden, nur Limits fuer die
// bestehenden drei definiert. Alle Werte sind eigene, dokumentierte
// Annahmen (keine externe Vorgabe vorhanden) und koennen in einer
// spaeteren Phase pro Organisation ueberschreibbar gemacht werden, falls
// noetig - aktuell gilt ein Limit strikt pro Plan.
//
// Phase 17 Auftragspunkt 14/15 "Rate Limits"/"Quotas" - ergaenzt um
// gestaffelte Rate-Limits (READ > WRITE > EXECUTE, je strenger je
// gefaehrlicher der Seiteneffekt) und eine dedizierte Tages-Quota fuer die
// sicherheitskritischste Kategorie (Automation-Ausfuehrungen). Die
// bestehende allgemeine apiRequestsPerDay-Quota bleibt unveraendert die
// UEBERGEORDNETE Grenze fuer ALLE Requests (auch Writes/Executes) - es
// wurde bewusst KEINE zusaetzliche separate "Write Requests pro Tag"-Quota
// eingefuehrt, da sie keine zusaetzliche, klar abgegrenzte Business-
// Bedeutung ueber die bereits vorhandene allgemeine Tages-Quota und die
// neue Execute-spezifische Quota hinaus haette (siehe Abschlussbericht,
// "Bekannte Einschraenkungen").
export interface PlanLimits {
  /** Lesende API-Requests pro Minute (Missbrauchsschutz, siehe middleware/api-key-auth.ts). */
  apiRequestsPerMinute: number;
  /** Schreibende API-Requests pro Minute (strenger als Read). */
  apiWriteRequestsPerMinute: number;
  /** Automation-Execute-Requests pro Minute (am strengsten - gefaehrlichste Kategorie). */
  apiExecuteRequestsPerMinute: number;
  /** API-Requests pro Kalendertag, ALLE Kategorien zusammen (Geschaefts-Quota). */
  apiRequestsPerDay: number;
  /** Automation-Ausfuehrungen pro Kalendertag - dedizierte, zusaetzliche Obergrenze. */
  automationExecutionsPerDay: number;
  /** Maximale Anzahl aktiver (nicht widerrufener) API-Keys pro Organisation. */
  maxApiKeys: number;
  /** Maximale Anzahl aktiver Service Accounts pro Organisation. */
  maxServiceAccounts: number;
  /**
   * Phase 18 Auftragspunkt 7 "Quota" - Gesamtanzahl aller Automation-Regeln
   * einer Organisation (ueber alle Projekte hinweg, nicht zeitabhaengig -
   * daher kein Retry-After bei Ueberschreitung, analog zu maxApiKeys/
   * maxServiceAccounts oben).
   */
  automationRulesPerOrganization: number;
  /**
   * Phase 21 Auftragspunkt 17 "Alert Rule Quotas" - Gesamtanzahl aller
   * Alert-Regeln einer Organisation (ueber alle Projekte hinweg), analog zu
   * automationRulesPerOrganization - bisher hatten Alert-Regeln UEBERHAUPT
   * kein Limit (echte gefundene Luecke).
   */
  alertRulesPerOrganization: number;
  /**
   * Phase 22 Auftragspunkt 19 "Plan Quotas" - Gesamtanzahl aller SLOs einer
   * Organisation (ueber alle Teams/Projekte hinweg), analog zu
   * alertRulesPerOrganization/automationRulesPerOrganization.
   */
  sloPerOrganization: number;
  /**
   * Phase 23 Auftragspunkt 21 "Quotas" - Gesamtanzahl aller Services bzw.
   * Service-Dependencies einer Organisation, analog zu sloPerOrganization.
   */
  servicesPerOrganization: number;
  dependenciesPerOrganization: number;
  /**
   * Phase 24 Auftragspunkt 8 "Quotas" - Gesamtanzahl aller On-Call-Schedules
   * einer Organisation (ueber alle Teams hinweg), analog zu
   * servicesPerOrganization/sloPerOrganization.
   */
  onCallSchedulesPerOrganization: number;
  /**
   * Phase 27 Auftragspunkt "Escalation Policies" - Gesamtanzahl aller
   * Escalation Policies einer Organisation, analog zu
   * onCallSchedulesPerOrganization (ebenfalls eine begrenzte, selten
   * geaenderte Konfigurationsressource - anders als z.B. Deployments, ein
   * wachsendes Ereignis-Log ohne vergleichbares Limit, siehe Phase 27
   * "Enterprise Deployment Tracking" Abschlussbericht "Quotas").
   */
  escalationPoliciesPerOrganization: number;
}

export const PLAN_LIMITS: Record<OrganizationPlan, PlanLimits> = {
  FREE: {
    apiRequestsPerMinute: 30,
    apiWriteRequestsPerMinute: 10,
    apiExecuteRequestsPerMinute: 3,
    apiRequestsPerDay: 1_000,
    automationExecutionsPerDay: 20,
    maxApiKeys: 3,
    maxServiceAccounts: 2,
    automationRulesPerOrganization: 10,
    alertRulesPerOrganization: 20,
    sloPerOrganization: 5,
    servicesPerOrganization: 10,
    dependenciesPerOrganization: 25,
    onCallSchedulesPerOrganization: 5,
    escalationPoliciesPerOrganization: 5,
  },
  PRO: {
    apiRequestsPerMinute: 120,
    apiWriteRequestsPerMinute: 40,
    apiExecuteRequestsPerMinute: 10,
    apiRequestsPerDay: 20_000,
    automationExecutionsPerDay: 200,
    maxApiKeys: 20,
    maxServiceAccounts: 10,
    automationRulesPerOrganization: 100,
    alertRulesPerOrganization: 200,
    sloPerOrganization: 50,
    servicesPerOrganization: 100,
    dependenciesPerOrganization: 500,
    onCallSchedulesPerOrganization: 50,
    escalationPoliciesPerOrganization: 50,
  },
  ENTERPRISE: {
    apiRequestsPerMinute: 600,
    apiWriteRequestsPerMinute: 200,
    apiExecuteRequestsPerMinute: 50,
    apiRequestsPerDay: 200_000,
    automationExecutionsPerDay: 2_000,
    maxApiKeys: 100,
    maxServiceAccounts: 50,
    automationRulesPerOrganization: 1_000,
    alertRulesPerOrganization: 2_000,
    sloPerOrganization: 500,
    servicesPerOrganization: 1_000,
    dependenciesPerOrganization: 10_000,
    onCallSchedulesPerOrganization: 500,
    escalationPoliciesPerOrganization: 500,
  },
};

// Schwellenwerte fuer Auftragspunkt 14 "Usage Warning" - Prozentsaetze der
// Tages-Quota (apiRequestsPerDay), bei denen eine Warnung ausgeloest wird
// (einmalig je Schwelle und Kalendertag, siehe core/api-quota-warning.ts).
export const QUOTA_WARNING_THRESHOLDS = [80, 90, 100] as const;
export type QuotaWarningThreshold = (typeof QUOTA_WARNING_THRESHOLDS)[number];

export function getPlanLimits(plan: OrganizationPlan): PlanLimits {
  return PLAN_LIMITS[plan];
}
