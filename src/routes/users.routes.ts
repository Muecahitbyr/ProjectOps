import { Router } from "express";
import { z } from "zod";
import { createUser, getProjectsForUser, getUserByEmail, getUserById, listRoles, listUsers } from "../db/users.repository";
import { getUserLastActiveAt, isUserOnline } from "../realtime/websocket.server";
import { authenticate } from "../middleware/authenticate";
import { authorizeGlobalAdmin } from "../middleware/authorize";
import type { UserWithPresence } from "../types/user.types";

export const usersRouter = Router();

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  avatar: z.string().trim().url().max(2048).optional(),
});

usersRouter.get("/users", authenticate, async (_req, res) => {
  const users = await listUsers();
  const withPresence: UserWithPresence[] = await Promise.all(
    users.map(async (user) => ({
      ...user,
      presence: { online: isUserOnline(user.id), lastActiveAt: getUserLastActiveAt(user.id) },
      projects: await getProjectsForUser(user.id),
    })),
  );
  res.json(withPresence);
});

usersRouter.get("/roles", authenticate, async (_req, res) => {
  res.json(await listRoles());
});

usersRouter.post("/users", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const existing = await getUserByEmail(parsed.data.email);
  if (existing) {
    res.status(409).json({ error: "Ein Benutzer mit dieser E-Mail existiert bereits" });
    return;
  }

  const user = await createUser({
    name: parsed.data.name,
    email: parsed.data.email,
    ...(parsed.data.avatar !== undefined ? { avatar: parsed.data.avatar } : {}),
  });
  res.status(201).json({ ...user, presence: { online: false, lastActiveAt: null }, projects: [] } satisfies UserWithPresence);
});

usersRouter.get("/users/:id", authenticate, async (req, res) => {
  const user = await getUserById(req.params.id as string);
  if (!user) {
    res.status(404).json({ error: "Benutzer nicht gefunden" });
    return;
  }

  const withPresence: UserWithPresence = {
    ...user,
    presence: { online: isUserOnline(user.id), lastActiveAt: getUserLastActiveAt(user.id) },
    projects: await getProjectsForUser(user.id),
  };
  res.json(withPresence);
});
