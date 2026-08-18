import { Router } from "express";
import { z } from "zod";
import {
  addOrganizationMember,
  createOrganization,
  getOrganizationById,
  getOrganizationMembership,
  isPlatformOwner,
  listOrganizationMembers,
  listOrganizations,
  removeOrganizationMember,
  updateOrganization,
} from "../db/organizations.repository";
import { authenticate } from "../middleware/authenticate";
import { authorizeOrganizationMembership, authorizeOrganizationRole } from "../middleware/authorize";
import { notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import type { OrganizationRoleId } from "../types/organization.types";
import type { Request } from "express";

// Phase 15 Teil 1/2 "Multi-Tenant Architektur"/"Organisationen".
export const organizationsRouter = Router();

const MANAGE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN"];
const ORG_ROLE_VALUES: OrganizationRoleId[] = [
  "PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "SECURITY_ADMIN",
  "BILLING_ADMIN", "DEVELOPER", "OPERATOR", "VIEWER", "SERVICE_ACCOUNT",
];

async function resolveOrganizationIdFromParam(req: Request): Promise<string | undefined> {
  return typeof req.params.id === "string" ? req.params.id : undefined;
}

// Nur Organisationen, denen der Benutzer angehoert (Auftragspunkt 14
// "Tenant Isolation") - ausser fuer Platform Owner (organisationsuebergreifende
// Sicht, Auftragspunkt 9 "Global Administration").
organizationsRouter.get("/organizations", authenticate, async (req, res) => {
  const userId = req.userId!;
  if (await isPlatformOwner(userId)) {
    res.json(await listOrganizations());
    return;
  }
  const all = await listOrganizations();
  const memberships = await Promise.all(all.map(async (org) => ({ org, role: await getOrganizationMembership(org.id, userId) })));
  res.json(memberships.filter((entry) => entry.role !== undefined).map((entry) => entry.org));
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9-]+$/, "Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten"),
  plan: z.enum(["FREE", "PRO", "ENTERPRISE"]).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  language: z.string().trim().min(1).max(16).optional(),
  region: z.string().trim().min(1).max(64).optional(),
  brandColor: z.string().trim().min(1).max(32).optional(),
});

organizationsRouter.post("/organizations", authenticate, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const { name, slug, plan, timezone, language, region, brandColor } = parsed.data;
  const organization = await createOrganization({
    name,
    slug,
    ...(plan !== undefined ? { plan } : {}),
    ...(timezone !== undefined ? { timezone } : {}),
    ...(language !== undefined ? { language } : {}),
    ...(region !== undefined ? { region } : {}),
    ...(brandColor !== undefined ? { brandColor } : {}),
    ...(req.userId !== undefined ? { ownerId: req.userId } : {}),
  });
  // Der erstellende Benutzer wird automatisch ORGANIZATION_OWNER - ohne
  // dies koennte niemand die neu erstellte Organisation je verwalten
  // (Selbstbedienungs-Erstellung, wie bei einer echten SaaS-Anmeldung).
  await addOrganizationMember(organization.id, req.userId!, "ORGANIZATION_OWNER");

  broadcast(createEvent(RealtimeEventType.ORGANIZATION_CREATED, organization));
  void recordAuditLog({
    userId: req.userId!,
    action: "ORGANIZATION_CREATED",
    category: "SYSTEM",
    message: `Organisation "${organization.name}" erstellt`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(organization);
});

organizationsRouter.get("/organizations/:id", authenticate, authorizeOrganizationMembership(resolveOrganizationIdFromParam), async (req, res) => {
  const organization = await getOrganizationById(req.params.id as string);
  if (!organization) {
    throw notFoundError("Organisation nicht gefunden");
  }
  res.json(organization);
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  plan: z.enum(["FREE", "PRO", "ENTERPRISE"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  language: z.string().trim().min(1).max(16).optional(),
  region: z.string().trim().min(1).max(64).optional(),
  brandColor: z.string().trim().min(1).max(32).optional(),
});

organizationsRouter.patch("/organizations/:id", authenticate, authorizeOrganizationRole(MANAGE_ROLES, resolveOrganizationIdFromParam), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const { name, plan, status, timezone, language, region, brandColor } = parsed.data;
  const updated = await updateOrganization(req.params.id as string, {
    ...(name !== undefined ? { name } : {}),
    ...(plan !== undefined ? { plan } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(timezone !== undefined ? { timezone } : {}),
    ...(language !== undefined ? { language } : {}),
    ...(region !== undefined ? { region } : {}),
    ...(brandColor !== undefined ? { brandColor } : {}),
  });
  if (!updated) {
    throw notFoundError("Organisation nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.ORGANIZATION_UPDATED, updated));
  broadcast(createEvent(RealtimeEventType.TENANT_UPDATED, { organizationId: updated.id, generatedAt: new Date().toISOString() }));
  void recordAuditLog({
    userId: req.userId!,
    action: "ORGANIZATION_UPDATED",
    category: "SYSTEM",
    message: `Organisation "${updated.name}" aktualisiert`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

organizationsRouter.get("/organizations/:id/members", authenticate, authorizeOrganizationMembership(resolveOrganizationIdFromParam), async (req, res) => {
  res.json(await listOrganizationMembers(req.params.id as string));
});

const addMemberSchema = z.object({ userId: z.string().trim().min(1), roleId: z.enum(ORG_ROLE_VALUES as [OrganizationRoleId, ...OrganizationRoleId[]]) });

organizationsRouter.post("/organizations/:id/members", authenticate, authorizeOrganizationRole(MANAGE_ROLES, resolveOrganizationIdFromParam), async (req, res) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  // Phase 65 "Enterprise Platform Consolidation & Final Gap Analysis" -
  // live gefundene, echte Rechteausweitung: isPlatformOwner() (siehe
  // db/organizations.repository.ts) ist organisationsuebergreifend - true,
  // sobald der Nutzer in IRGENDEINER Organisation PLATFORM_OWNER ist. Da
  // ORGANIZATION_OWNER (den JEDER Nutzer sich selbst per POST /organizations
  // fuer eine neue, eigene Organisation zuweisen kann) bereits in
  // MANAGE_ROLES enthalten ist und roleId hier bislang JEDEN Wert aus
  // ORG_ROLE_VALUES (inkl. PLATFORM_OWNER) akzeptierte, konnte sich jeder
  // Nutzer in zwei Requests selbst zum globalen PLATFORM_OWNER machen (eigene
  // Organisation erstellen -> sich selbst darin auf PLATFORM_OWNER setzen).
  // Nur ein bereits echter PLATFORM_OWNER darf diese Rolle vergeben.
  if (parsed.data.roleId === "PLATFORM_OWNER" && !(await isPlatformOwner(req.userId!))) {
    res.status(403).json({ error: "Nur ein bestehender Platform Owner kann die Rolle PLATFORM_OWNER vergeben" });
    return;
  }
  const member = await addOrganizationMember(req.params.id as string, parsed.data.userId, parsed.data.roleId);
  void recordAuditLog({
    userId: req.userId!,
    action: "ORGANIZATION_MEMBER_ADDED",
    category: "SYSTEM",
    message: `${member.userName} als ${member.roleId} zur Organisation hinzugefuegt`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(member);
});

organizationsRouter.delete(
  "/organizations/:id/members/:userId",
  authenticate,
  authorizeOrganizationRole(MANAGE_ROLES, resolveOrganizationIdFromParam),
  async (req, res) => {
    const removed = await removeOrganizationMember(req.params.id as string, req.params.userId as string);
    if (!removed) {
      throw notFoundError("Mitgliedschaft nicht gefunden");
    }
    void recordAuditLog({
      userId: req.userId!,
      action: "ORGANIZATION_MEMBER_REMOVED",
      category: "SYSTEM",
      message: `Mitglied aus Organisation entfernt`,
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(204).end();
  },
);
