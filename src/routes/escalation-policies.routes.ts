import { Router } from "express";
import { z } from "zod";
import type { Request } from "express";
import {
  createEscalationPolicyIfUnderQuota,
  deleteEscalationPolicy,
  getEscalationPolicyById,
  getEscalationPolicyOrganizationId,
  listEscalationPolicies,
  listEscalationSteps,
  replaceEscalationPolicySteps,
  updateEscalationPolicy,
} from "../db/escalation-policies.repository";
import { getOrganizationById } from "../db/organizations.repository";
import { getOnCallScheduleOrganizationId } from "../db/on-call.repository";
import { getUserById } from "../db/users.repository";
import { getPlanLimits } from "../config/plan-limits";
import { ESCALATION_TARGET_TYPES, MAX_ESCALATION_STEPS_PER_POLICY } from "../types/escalation-policy.types";
import type { EscalationTargetType } from "../types/escalation-policy.types";
import { authenticate } from "../middleware/authenticate";
import { authorizePlatformOrOrganizationMembership, authorizePlatformOrOrganizationRole } from "../middleware/authorize";
import { AppError, notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import type { OrganizationRoleId } from "../types/organization.types";

// Phase 27 "Enterprise On-Call & Escalation Management" - dieselbe Struktur
// wie routes/on-call.routes.ts (Phase 24): von Anfang an mit dem korrekten,
// organisationsscharfen RBAC (authorizePlatformOrOrganization{Membership,
// Role}()) statt der zu breiten authorizePlatformOwner()-Pruefung, die in
// frueheren Phasen (SLO/Services) zu einem echten Cross-Tenant-Bug fuehrte.
export const escalationPoliciesRouter = Router();

const MANAGE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "OPERATOR", "DEVELOPER"];

async function resolveOrgIdFromQuery(req: Request): Promise<string | undefined> {
  return typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
}

async function resolveOrgIdFromBody(req: Request): Promise<string | undefined> {
  return typeof req.body?.organizationId === "string" ? req.body.organizationId : undefined;
}

async function resolveOrgIdForPolicy(req: Request): Promise<string | null> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return null;
  return (await getEscalationPolicyOrganizationId(id)) ?? null;
}

escalationPoliciesRouter.get(
  "/escalation-policies",
  authenticate,
  authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery),
  async (req, res) => {
    if (typeof req.query.organizationId !== "string") {
      res.status(400).json({ error: "organizationId ist erforderlich" });
      return;
    }
    const policies = await listEscalationPolicies(req.query.organizationId);
    const withSteps = await Promise.all(
      policies.map(async (policy) => ({ ...policy, steps: await listEscalationSteps(policy.id) })),
    );
    res.json(withSteps);
  },
);

escalationPoliciesRouter.get(
  "/escalation-policies/:id",
  authenticate,
  authorizePlatformOrOrganizationMembership(resolveOrgIdForPolicy),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Policy-ID" });
      return;
    }
    const policy = await getEscalationPolicyById(id);
    if (!policy) {
      throw notFoundError("Escalation Policy nicht gefunden");
    }
    res.json({ ...policy, steps: await listEscalationSteps(id) });
  },
);

const createPolicySchema = z
  .object({
    organizationId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

escalationPoliciesRouter.post(
  "/escalation-policies",
  authenticate,
  authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdFromBody),
  async (req, res) => {
    const parsed = createPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
      return;
    }
    const organization = await getOrganizationById(parsed.data.organizationId);
    if (!organization) {
      res.status(404).json({ error: "Organisation nicht gefunden" });
      return;
    }
    const limits = getPlanLimits(organization.plan);
    const { organizationId, name, description, enabled } = parsed.data;
    const policy = await createEscalationPolicyIfUnderQuota(
      {
        organizationId,
        name,
        ...(description !== undefined ? { description } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        ...(req.userId ? { createdBy: req.userId } : {}),
      },
      limits.escalationPoliciesPerOrganization,
    );
    if (!policy) {
      throw new AppError(
        409,
        "CONFLICT",
        `Plan-Limit erreicht: maximal ${limits.escalationPoliciesPerOrganization} Escalation Policies fuer den Plan ${organization.plan}`,
      );
    }
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "ESCALATION_POLICY_CREATED",
      category: "ON_CALL",
      message: `Escalation Policy "${policy.name}" erstellt`,
      metadata: { policyId: policy.id, organizationId: policy.organizationId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(201).json({ ...policy, steps: [] });
  },
);

const updatePolicySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

escalationPoliciesRouter.patch(
  "/escalation-policies/:id",
  authenticate,
  authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForPolicy),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Policy-ID" });
      return;
    }
    const parsed = updatePolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
      return;
    }
    const { name, description, enabled } = parsed.data;
    const updated = await updateEscalationPolicy(id, {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    });
    if (!updated) {
      throw notFoundError("Escalation Policy nicht gefunden");
    }
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "ESCALATION_POLICY_UPDATED",
      category: "ON_CALL",
      message: `Escalation Policy "${updated.name}" aktualisiert`,
      metadata: { policyId: updated.id, organizationId: updated.organizationId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.json({ ...updated, steps: await listEscalationSteps(id) });
  },
);

escalationPoliciesRouter.delete(
  "/escalation-policies/:id",
  authenticate,
  authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForPolicy),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Policy-ID" });
      return;
    }
    const existing = await getEscalationPolicyById(id);
    if (!existing) {
      throw notFoundError("Escalation Policy nicht gefunden");
    }
    await deleteEscalationPolicy(id);
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "ESCALATION_POLICY_DELETED",
      category: "ON_CALL",
      message: `Escalation Policy "${existing.name}" geloescht`,
      metadata: { policyId: id, organizationId: existing.organizationId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(204).end();
  },
);

const stepSchema = z
  .object({
    stepOrder: z.number().int().min(1),
    delayMinutes: z.number().int().min(0).max(1440),
    targetType: z.enum(ESCALATION_TARGET_TYPES as [EscalationTargetType, ...EscalationTargetType[]]),
    targetUserId: z.string().trim().min(1).optional(),
    targetScheduleId: z.number().int().positive().optional(),
  })
  .strict()
  .refine((s) => (s.targetType === "USER" ? s.targetUserId !== undefined && s.targetScheduleId === undefined : true), {
    message: "targetUserId ist fuer targetType=USER erforderlich (targetScheduleId nicht erlaubt)",
  })
  .refine((s) => (s.targetType === "ON_CALL_SCHEDULE" ? s.targetScheduleId !== undefined && s.targetUserId === undefined : true), {
    message: "targetScheduleId ist fuer targetType=ON_CALL_SCHEDULE erforderlich (targetUserId nicht erlaubt)",
  });

const replaceStepsSchema = z
  .object({
    steps: z.array(stepSchema).max(MAX_ESCALATION_STEPS_PER_POLICY),
  })
  .strict();

escalationPoliciesRouter.put(
  "/escalation-policies/:id/steps",
  authenticate,
  authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForPolicy),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Policy-ID" });
      return;
    }
    const policy = await getEscalationPolicyById(id);
    if (!policy) {
      throw notFoundError("Escalation Policy nicht gefunden");
    }
    const parsed = replaceStepsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
      return;
    }

    const orders = parsed.data.steps.map((s) => s.stepOrder);
    if (new Set(orders).size !== orders.length) {
      res.status(400).json({ error: "stepOrder muss innerhalb der Policy eindeutig sein" });
      return;
    }

    // Tenant Isolation + Existenzpruefung fuer jedes referenzierte Ziel -
    // dieselbe 404-statt-403-Regel wie ueberall sonst (kein Existenz-Leak
    // fremder Organisationen).
    for (const step of parsed.data.steps) {
      if (step.targetType === "USER") {
        const user = await getUserById(step.targetUserId!);
        if (!user) {
          res.status(404).json({ error: `Benutzer fuer Stufe ${step.stepOrder} nicht gefunden` });
          return;
        }
      } else {
        const scheduleOrgId = await getOnCallScheduleOrganizationId(step.targetScheduleId!);
        if (!scheduleOrgId || scheduleOrgId !== policy.organizationId) {
          res.status(404).json({ error: `On-Call-Schedule fuer Stufe ${step.stepOrder} nicht gefunden` });
          return;
        }
      }
    }

    const steps = await replaceEscalationPolicySteps(
      id,
      parsed.data.steps.map((s) => ({
        stepOrder: s.stepOrder,
        delayMinutes: s.delayMinutes,
        targetType: s.targetType,
        ...(s.targetUserId !== undefined ? { targetUserId: s.targetUserId } : {}),
        ...(s.targetScheduleId !== undefined ? { targetScheduleId: s.targetScheduleId } : {}),
      })),
    );
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "ESCALATION_POLICY_STEPS_UPDATED",
      category: "ON_CALL",
      message: `Eskalationsstufen fuer Policy "${policy.name}" aktualisiert (${steps.length} Stufen)`,
      metadata: { policyId: id, organizationId: policy.organizationId, stepCount: steps.length },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.json({ ...policy, steps });
  },
);
