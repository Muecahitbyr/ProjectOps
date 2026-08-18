// Spiegelt src/config/plan-limits.ts (PlanLimits) im Backend. Phase 20
// "Enterprise API Governance, Developer Portal & Credential Lifecycle"
// Auftragspunkt 7 "Developer Portal" (Abschnitt A "API Overview").
export interface PlanLimits {
  apiRequestsPerMinute: number;
  apiWriteRequestsPerMinute: number;
  apiExecuteRequestsPerMinute: number;
  apiRequestsPerDay: number;
  automationExecutionsPerDay: number;
  maxApiKeys: number;
  maxServiceAccounts: number;
  automationRulesPerOrganization: number;
}

export interface OrganizationPlanLimits {
  plan: "FREE" | "PRO" | "ENTERPRISE";
  limits: PlanLimits;
}
