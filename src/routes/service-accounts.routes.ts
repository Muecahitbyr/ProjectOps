import { Router } from "express";
import { z } from "zod";
import {
  countActiveServiceAccounts,
  createServiceAccount,
  getServiceAccountById,
  listServiceAccounts,
  revokeServiceAccount,
  rotateServiceAccountSecret,
} from "../db/service-accounts.repository";
import { getOrganizationById } from "../db/organizations.repository";
import { getPlanLimits } from "../config/plan-limits";
import { generateServiceAccountSecret, hashServiceAccountSecret } from "../core/api-key-auth";
import { authenticate } from "../middleware/authenticate";
import { authorizeOrganizationMembership, authorizeOrganizationRole } from "../middleware/authorize";
import { credentialMintRateLimiter } from "../middleware/rate-limit";
import { AppError, notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { API_SCOPES, isApiScope } from "../types/api-scope.types";
import type { OrganizationRoleId } from "../types/organization.types";
import type { Request } from "express";

// Phase 15 Teil 6 "Service Accounts" - "Nur Backend": kein Login-Flow, rein
// maschinelle Bearer-Authentifizierung (core/api-key-auth.ts), Verwaltung
// ueber dieselben Organisationsrollen wie API Keys.
export const serviceAccountsRouter = Router();

const MANAGE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "SECURITY_ADMIN"];

async function resolveOrgIdFromQuery(req: Request): Promise<string | undefined> {
  return typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
}

async function resolveOrgIdFromBody(req: Request): Promise<string | undefined> {
  return typeof req.body?.organizationId === "string" ? req.body.organizationId : undefined;
}

serviceAccountsRouter.get("/service-accounts", authenticate, authorizeOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  res.json(await listServiceAccounts(req.query.organizationId as string));
});

const createSchema = z.object({
  organizationId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  scopes: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  expiresAt: z.string().trim().min(1).optional(),
});

serviceAccountsRouter.post("/service-accounts", authenticate, credentialMintRateLimiter, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromBody), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const { organizationId, name, scopes, expiresAt } = parsed.data;

  // Phase 20 Auftragspunkt 6 "Scope Governance" - gefundene Inkonsistenz:
  // im Unterschied zu routes/api-keys.routes.ts validierte diese Route
  // Scopes bisher NICHT gegen die real durchgesetzte Liste (API_SCOPES).
  // Aktuell folgenlos, da Service Accounts (anders als API Keys) noch
  // keine Authentifizierungs-Middleware besitzen, die ihre Scopes ueberhaupt
  // auswertet (siehe Abschlussbericht, "Bekannte Einschraenkungen") - aber
  // dieselbe Validierungsregel wie bei API Keys anzuwenden ist trotzdem
  // richtig: ein erfundener/falsch geschriebener Scope soll nicht
  // stillschweigend gespeichert werden koennen, sobald diese Durchsetzung
  // eines Tages existiert.
  const invalidScopes = (scopes ?? []).filter((scope) => !isApiScope(scope));
  if (invalidScopes.length > 0) {
    throw new AppError(400, "VALIDATION_ERROR", `Unbekannte Scopes: ${invalidScopes.join(", ")}`, { validScopes: API_SCOPES });
  }

  // Auftragspunkt 7 "API Quotas" (maxServiceAccounts) - Plan-Limit der
  // Organisation durchsetzen, bevor ein weiterer Service Account angelegt
  // wird (analog zu maxApiKeys, siehe routes/api-keys.routes.ts).
  const organization = await getOrganizationById(organizationId);
  if (!organization) {
    throw notFoundError("Organisation nicht gefunden");
  }
  const activeCount = await countActiveServiceAccounts(organizationId);
  const limits = getPlanLimits(organization.plan);
  if (activeCount >= limits.maxServiceAccounts) {
    throw new AppError(409, "CONFLICT", `Plan-Limit erreicht: maximal ${limits.maxServiceAccounts} aktive Service Accounts fuer den Plan ${organization.plan}`);
  }

  const plaintextSecret = generateServiceAccountSecret();
  const serviceAccount = await createServiceAccount(
    {
      organizationId,
      name,
      ...(scopes !== undefined ? { scopes } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      ...(req.userId !== undefined ? { createdBy: req.userId } : {}),
    },
    hashServiceAccountSecret(plaintextSecret),
  );

  broadcast(createEvent(RealtimeEventType.SERVICE_ACCOUNT_CREATED, serviceAccount));
  void recordAuditLog({
    userId: req.userId!,
    action: "SERVICE_ACCOUNT_CREATED",
    category: "SYSTEM",
    message: `Service Account "${serviceAccount.name}" erstellt`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });

  res.status(201).json({ serviceAccount, plaintextSecret });
});

async function resolveOrgIdForServiceAccount(req: Request): Promise<string | undefined> {
  const account = await getServiceAccountById(req.params.id as string);
  return account?.organizationId;
}

serviceAccountsRouter.post(
  "/service-accounts/:id/rotate-secret",
  authenticate,
  credentialMintRateLimiter,
  authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdForServiceAccount),
  async (req, res) => {
    const plaintextSecret = generateServiceAccountSecret();
    const updated = await rotateServiceAccountSecret(req.params.id as string, hashServiceAccountSecret(plaintextSecret));
    if (!updated) {
      throw notFoundError("Service Account nicht gefunden");
    }
    void recordAuditLog({
      userId: req.userId!,
      action: "SERVICE_ACCOUNT_SECRET_ROTATED",
      category: "SYSTEM",
      message: `Secret fuer Service Account "${updated.name}" rotiert`,
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.json({ serviceAccount: updated, plaintextSecret });
  },
);

serviceAccountsRouter.post(
  "/service-accounts/:id/revoke",
  authenticate,
  authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdForServiceAccount),
  async (req, res) => {
    const revoked = await revokeServiceAccount(req.params.id as string);
    if (!revoked) {
      throw notFoundError("Service Account nicht gefunden");
    }
    void recordAuditLog({
      userId: req.userId!,
      action: "SERVICE_ACCOUNT_REVOKED",
      category: "SYSTEM",
      severity: "WARNING",
      message: `Service Account "${revoked.name}" widerrufen`,
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.json(revoked);
  },
);
