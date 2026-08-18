import { Router } from "express";
import { z } from "zod";
import { getChangeById, listChanges, listServiceIdsForChange, listServiceIdsForChanges } from "../../db/changes.repository";
import { authenticateApiKey, apiKeyRateLimiter, enforceApiQuota, requireApiScope, trackApiUsage } from "../../middleware/api-key-auth";
import { paginatedResponse, parsePagination } from "./shared";
import { notFoundError } from "../../core/app-error";
import { analyzeChangeRisk } from "../../core/change-risk";
import { CHANGE_RISKS, CHANGE_TYPES, CHANGE_CATEGORIES, CHANGE_STATUSES } from "../../types/change.types";
import type { ChangeRisk, ChangeType, ChangeCategory, ChangeStatus } from "../../types/change.types";

// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk" - bewusst NUR lesend (siehe types/api-scope.types.ts#changes:read):
// externe Sichtbarkeit fuer ein Status-Dashboard/ChatOps-Integration, kein
// Schreibzugriff (Genehmigungs-Workflow setzt einen menschlichen,
// Session-authentifizierten Akteur voraus). Changes sind organisations-,
// nicht teamgebunden (siehe Migration 0051) - ein team-gebundener Key sieht
// daher wie bei routes/v1/on-call.routes.ts alle Changes der Organisation,
// keine zusaetzliche Team-Filterung (ein Change kann mehrere Services
// unterschiedlicher Teams betreffen, eine eindeutige "gehoert zu Team X"
// -Zuordnung gibt es fachlich nicht).
export const v1ChangesRouter = Router();

const listQuerySchema = z.object({
  status: z.enum(CHANGE_STATUSES as [ChangeStatus, ...ChangeStatus[]]).optional(),
  risk: z.enum(CHANGE_RISKS as [ChangeRisk, ...ChangeRisk[]]).optional(),
  changeType: z.enum(CHANGE_TYPES as [ChangeType, ...ChangeType[]]).optional(),
  category: z.enum(CHANGE_CATEGORIES as [ChangeCategory, ...ChangeCategory[]]).optional(),
});

v1ChangesRouter.get(
  "/v1/changes",
  authenticateApiKey,
  requireApiScope("changes:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Filter", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }
    const pagination = parsePagination(req);
    const all = await listChanges({
      organizationId: context.organizationId,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.risk ? { risk: parsed.data.risk } : {}),
      ...(parsed.data.changeType ? { changeType: parsed.data.changeType } : {}),
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
      limit: 1000,
    });
    const serviceIdsByChange = await listServiceIdsForChanges(all.map((c) => c.id));
    const page = all.slice(pagination.offset, pagination.offset + pagination.pageSize);
    res.json(
      paginatedResponse(
        page.map((c) => ({ ...c, serviceIds: serviceIdsByChange.get(c.id) ?? [] })),
        pagination,
        all.length,
      ),
    );
  },
);

v1ChangesRouter.get(
  "/v1/changes/:id",
  authenticateApiKey,
  requireApiScope("changes:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Change-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const change = await getChangeById(id);
    if (!change || change.organizationId !== context.organizationId) {
      throw notFoundError("Change nicht gefunden");
    }
    const serviceIds = await listServiceIdsForChange(id);
    res.json({ data: { ...change, serviceIds } });
  },
);

// Phase 29 "Enterprise Change Intelligence, Risk Correlation & Deployment
// Safety" Auftragspunkt 9 - fachlich sinnvoll fuer ein externes CI/CD-
// System, das VOR dem eigenen Deployment-Schritt automatisiert pruefen
// will, ob ein verknuepfter Change als riskant/blockiert gilt. Bestehender
// Scope "changes:read" wiederverwendet, KEIN neuer Scope (rein lesend,
// identisch zur internen Risikoanalyse - kein zweiter Berechnungspfad).
v1ChangesRouter.get(
  "/v1/changes/:id/risk",
  authenticateApiKey,
  requireApiScope("changes:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Change-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const change = await getChangeById(id);
    if (!change || change.organizationId !== context.organizationId) {
      throw notFoundError("Change nicht gefunden");
    }
    const serviceIds = await listServiceIdsForChange(id);
    const analysis = await analyzeChangeRisk({ ...change, serviceIds });
    res.json({ data: analysis });
  },
);
