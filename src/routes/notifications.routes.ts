import { Router } from "express";
import { pool } from "../db/pool";
import { authenticate } from "../middleware/authenticate";

export const notificationsRouter = Router();

notificationsRouter.get("/notifications", authenticate, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT project_id, check_id, channel, status, message, error, created_at
     FROM notifications
     ORDER BY created_at DESC
     LIMIT 50`,
  );
  res.json(rows);
});
