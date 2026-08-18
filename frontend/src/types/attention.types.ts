// Phase 64 "Enterprise Operational Priority & Attention Management".
// Spiegelt src/types/attention.types.ts im Backend.

export type AttentionItemKind = "SERVICE_RISK" | "INCIDENT" | "PROBLEM" | "CHANGE" | "GOVERNANCE_CONFLICT";
export type AttentionTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AttentionItem {
  kind: AttentionItemKind;
  entityId: number | null;
  projectId: string | null;
  projectName: string | null;
  title: string;
  tier: AttentionTier;
  reason: string;
  recommendedAction: string;
  ownerId: string | null;
  createdAt: string | null;
  priorityScore: number | null;
}

export interface AttentionList {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  items: AttentionItem[];
  suppressedDuplicateIncidentCount: number;
}
