import { Router } from "express";
import {
  getAllProjectsHealth,
  getDashboardSummary,
  getProjectDashboardDetail,
  getRecentEvents,
  getTimeline,
} from "../db/dashboard.repository";
import { authenticate } from "../middleware/authenticate";

export const dashboardRouter = Router();

dashboardRouter.get("/dashboard", authenticate, async (_req, res) => {
  res.json(await getDashboardSummary());
});

dashboardRouter.get("/dashboard/projects", authenticate, async (_req, res) => {
  res.json(await getAllProjectsHealth());
});

dashboardRouter.get("/dashboard/timeline", authenticate, async (req, res) => {
  const hours = Number(req.query.hours) || 24;
  const limit = Number(req.query.limit) || 500;
  const offset = Number(req.query.offset) || 0;
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;

  res.json(await getTimeline({ hours, limit, offset, ...(projectId ? { projectId } : {}) }));
});

dashboardRouter.get("/dashboard/events", authenticate, async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json(await getRecentEvents(limit));
});

dashboardRouter.get("/dashboard/projects/:id", authenticate, async (req, res) => {
  const detail = await getProjectDashboardDetail(req.params.id as string);

  if (!detail) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  res.json(detail);
});
