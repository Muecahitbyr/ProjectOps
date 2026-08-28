import { Router } from "express";
import { z } from "zod";
import { createTodo, deleteTodo, listDistinctCategories, listTodos, moveTodo, updateTodo } from "../db/todos.repository";
import { authenticate } from "../middleware/authenticate";
import { notFoundError } from "../core/app-error";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";

// Todo-Panel unter KI-Buero - dieselbe "Shared Ops Console"-Konvention wie
// /incidents, /projects etc. (siehe dortiger Kommentar): kein
// projektbezogenes RBAC, jeder angemeldete Nutzer dieses internen
// Einzelbetreiber-Tools sieht/verwaltet alle Todos.
export const todosRouter = Router();

function parseTodoId(req: import("express").Request): number | undefined {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : undefined;
}

const DATE_ONLY = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss im Format YYYY-MM-DD sein");

todosRouter.get("/todos", authenticate, async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  res.json(await listTodos({ ...(category ? { category } : {}) }));
});

// Bereits verwendete Kategorien fuer den Autocomplete im Frontend - eigene,
// schmale Route statt die volle Todo-Liste dafuer zu durchsuchen.
todosRouter.get("/todos/categories", authenticate, async (_req, res) => {
  res.json(await listDistinctCategories());
});

const createSchema = z
  .object({
    category: z.string().trim().min(1).max(120).nullable().optional(),
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(5000).nullable().optional(),
    dueDate: DATE_ONLY.nullable().optional(),
  })
  .strict();

todosRouter.post("/todos", authenticate, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const todo = await createTodo(parsed.data);
  broadcast(createEvent(RealtimeEventType.TODO_UPDATED, todo));
  res.status(201).json(todo);
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    done: z.boolean().optional(),
    dueDate: DATE_ONLY.nullable().optional(),
    needsTesting: z.boolean().optional(),
  })
  .strict();

todosRouter.patch("/todos/:id", authenticate, async (req, res) => {
  const id = parseTodoId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Todo-ID" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const todo = await updateTodo(id, parsed.data);
  if (!todo) {
    throw notFoundError("Todo nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.TODO_UPDATED, todo));
  res.json(todo);
});

const moveSchema = z.object({ direction: z.enum(["up", "down"]) }).strict();

// Vertauscht die Reihenfolge mit dem direkten Nachbarn innerhalb derselben
// Kategorie (siehe db/todos.repository.ts::moveTodo) - Nutzerwunsch
// "Reihenfolge soll man auch aendern koennen".
todosRouter.post("/todos/:id/move", authenticate, async (req, res) => {
  const id = parseTodoId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Todo-ID" });
    return;
  }
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const changed = await moveTodo(id, parsed.data.direction);
  if (!changed) {
    throw notFoundError("Todo nicht gefunden");
  }
  for (const todo of changed) {
    broadcast(createEvent(RealtimeEventType.TODO_UPDATED, todo));
  }
  res.json(changed);
});

todosRouter.delete("/todos/:id", authenticate, async (req, res) => {
  const id = parseTodoId(req);
  if (id === undefined) {
    res.status(400).json({ error: "Ungueltige Todo-ID" });
    return;
  }
  const todo = await deleteTodo(id);
  if (!todo) {
    throw notFoundError("Todo nicht gefunden");
  }
  broadcast(createEvent(RealtimeEventType.TODO_UPDATED, todo));
  res.status(204).end();
});
