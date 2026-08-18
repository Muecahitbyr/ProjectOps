import { Router } from "express";
import { pool } from "../db/pool";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  let database: "connected" | "disconnected" = "disconnected";

  try {
    await pool.query("SELECT 1");
    database = "connected";
  } catch {
    database = "disconnected";
  }

  res.json({
    status: "ok",
    uptime: process.uptime(),
    database,
    timestamp: new Date().toISOString(),
  });
});
