import { Router } from "express";
import { z } from "zod";
import { monitorService } from "../core/monitor";
import {
  getAnalyticsSummary,
  getDrillDown,
  getIncidentAnalytics,
  getProjectComparison,
  getProjectHistory,
  getProjectSla,
  getResponseTimeAnalytics,
} from "../db/analytics.repository";
import { authenticate } from "../middleware/authenticate";
import type { DrillDownFilters } from "../types/analytics.types";

export const analyticsRouter = Router();

const RANGE_VALUES = ["1h", "24h", "7d", "30d", "custom"] as const;
const CHECK_STATUS_VALUES = ["ONLINE", "WARNING", "OFFLINE", "ERROR"] as const;
const SEVERITY_VALUES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const rangeSchema = z.enum(RANGE_VALUES).catch("24h");

function parseHours(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// resolveTimeWindow() (analytics.repository.ts) wirft bei range=custom ohne
// gueltige from/to - hier zentral in eine 400-Antwort uebersetzt, statt in
// jedem Handler einzeln try/catch zu wiederholen.
async function handleRangeAware<T>(res: import("express").Response, fn: () => Promise<T>): Promise<void> {
  try {
    res.json(await fn());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Ungueltige Anfrage" });
  }
}

analyticsRouter.get("/analytics/summary", authenticate, async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const hours = req.query.hours !== undefined ? parseHours(req.query.hours, 24 * 30) : undefined;

  res.json(await getAnalyticsSummary({ ...(projectId ? { projectId } : {}), ...(hours ? { hours } : {}) }));
});

analyticsRouter.get("/analytics/projects/:id/history", authenticate, async (req, res) => {
  const projectId = req.params.id as string;
  if (!monitorService.getProject(projectId)) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  const range = rangeSchema.parse(req.query.range);
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;

  await handleRangeAware(res, () => getProjectHistory(projectId, range, from, to));
});

analyticsRouter.get("/analytics/projects/:id/sla", authenticate, async (req, res) => {
  const projectId = req.params.id as string;
  if (!monitorService.getProject(projectId)) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  const hours = parseHours(req.query.hours, 24 * 30);
  res.json(await getProjectSla(projectId, hours));
});

analyticsRouter.get("/analytics/incidents", authenticate, async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const hours = req.query.hours !== undefined ? parseHours(req.query.hours, 24 * 30) : undefined;

  res.json(await getIncidentAnalytics({ ...(projectId ? { projectId } : {}), ...(hours ? { hours } : {}) }));
});

analyticsRouter.get("/analytics/response-time", authenticate, async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const checkId = typeof req.query.checkId === "string" ? req.query.checkId : undefined;
  const range = rangeSchema.parse(req.query.range);
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;

  await handleRangeAware(res, () =>
    getResponseTimeAnalytics({
      ...(projectId ? { projectId } : {}),
      ...(checkId ? { checkId } : {}),
      range,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
  );
});

analyticsRouter.get("/analytics/compare", authenticate, async (req, res) => {
  const projectAId = typeof req.query.projectAId === "string" ? req.query.projectAId : undefined;
  const projectBId = typeof req.query.projectBId === "string" ? req.query.projectBId : undefined;

  if (!projectAId || !projectBId) {
    res.status(400).json({ error: "projectAId und projectBId sind erforderlich" });
    return;
  }
  if (!monitorService.getProject(projectAId) || !monitorService.getProject(projectBId)) {
    res.status(404).json({ error: "Mindestens eines der Projekte wurde nicht gefunden" });
    return;
  }

  const hours = parseHours(req.query.hours, 24 * 30);
  res.json(await getProjectComparison(projectAId, projectBId, hours));
});

const drillDownQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  status: z.enum(CHECK_STATUS_VALUES).optional(),
  severity: z.enum(SEVERITY_VALUES).optional(),
  checkType: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(0).catch(0),
  pageSize: z.coerce.number().int().min(1).max(200).catch(50),
});

analyticsRouter.get("/analytics/drilldown", authenticate, async (req, res) => {
  const parsed = drillDownQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }

  const { page, pageSize, projectId, status, severity, checkType, search, from, to } = parsed.data;
  const filters: DrillDownFilters = {
    ...(projectId ? { projectId } : {}),
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
    ...(checkType ? { checkType } : {}),
    ...(search ? { search } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  res.json(await getDrillDown(filters, page, pageSize));
});
