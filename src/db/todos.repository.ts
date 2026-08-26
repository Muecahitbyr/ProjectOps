import { pool } from "./pool";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "../types/todo.types";

interface TodoRow {
  id: string | number;
  project_id: string | null;
  title: string;
  description: string | null;
  done: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// BIGSERIAL-Id kommt vom pg-Treiber als String zurueck - explizit zu Number
// gewandelt (siehe CLAUDE.md BIGSERIAL/BIGINT-Konvention).
function mapRow(row: TodoRow): Todo {
  return {
    id: Number(row.id),
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    done: row.done,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

const TODO_COLUMNS = `id, project_id, title, description, done, created_at, updated_at`;

export async function listTodos(options: { projectId?: string } = {}): Promise<Todo[]> {
  if (options.projectId) {
    const { rows } = await pool.query<TodoRow>(
      `SELECT ${TODO_COLUMNS} FROM todos WHERE project_id = $1 ORDER BY done ASC, created_at DESC`,
      [options.projectId],
    );
    return rows.map(mapRow);
  }
  const { rows } = await pool.query<TodoRow>(`SELECT ${TODO_COLUMNS} FROM todos ORDER BY done ASC, created_at DESC`);
  return rows.map(mapRow);
}

export async function getTodoById(id: number): Promise<Todo | undefined> {
  const { rows } = await pool.query<TodoRow>(`SELECT ${TODO_COLUMNS} FROM todos WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  const { rows } = await pool.query<TodoRow>(
    `INSERT INTO todos (project_id, title, description) VALUES ($1, $2, $3) RETURNING ${TODO_COLUMNS}`,
    [input.projectId ?? null, input.title, input.description ?? null],
  );
  return mapRow(rows[0]!);
}

export async function updateTodo(id: number, input: UpdateTodoInput): Promise<Todo | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) {
    values.push(input.title);
    sets.push(`title = $${values.length}`);
  }
  if (input.description !== undefined) {
    values.push(input.description);
    sets.push(`description = $${values.length}`);
  }
  if (input.done !== undefined) {
    values.push(input.done);
    sets.push(`done = $${values.length}`);
  }
  if (sets.length === 0) {
    return getTodoById(id);
  }
  sets.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await pool.query<TodoRow>(
    `UPDATE todos SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${TODO_COLUMNS}`,
    values,
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteTodo(id: number): Promise<Todo | undefined> {
  const { rows } = await pool.query<TodoRow>(`DELETE FROM todos WHERE id = $1 RETURNING ${TODO_COLUMNS}`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}
