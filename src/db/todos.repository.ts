import { pool } from "./pool";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "../types/todo.types";

interface TodoRow {
  id: string | number;
  category: string | null;
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
    category: row.category,
    title: row.title,
    description: row.description,
    done: row.done,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

const TODO_COLUMNS = `id, category, title, description, done, created_at, updated_at`;

export async function listTodos(options: { category?: string } = {}): Promise<Todo[]> {
  if (options.category) {
    const { rows } = await pool.query<TodoRow>(
      `SELECT ${TODO_COLUMNS} FROM todos WHERE category = $1 ORDER BY done ASC, created_at DESC`,
      [options.category],
    );
    return rows.map(mapRow);
  }
  const { rows } = await pool.query<TodoRow>(`SELECT ${TODO_COLUMNS} FROM todos ORDER BY done ASC, created_at DESC`);
  return rows.map(mapRow);
}

// Echte, bereits verwendete Kategorien (kein separates Stammdaten-Konzept) -
// speist den Autocomplete-Vorschlag im Frontend, damit Tippfehler/
// Varianten desselben Vorhabens nicht unnoetig auseinanderlaufen.
export async function listDistinctCategories(): Promise<string[]> {
  const { rows } = await pool.query<{ category: string }>(
    `SELECT DISTINCT category FROM todos WHERE category IS NOT NULL ORDER BY category ASC`,
  );
  return rows.map((row) => row.category);
}

export async function getTodoById(id: number): Promise<Todo | undefined> {
  const { rows } = await pool.query<TodoRow>(`SELECT ${TODO_COLUMNS} FROM todos WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  const { rows } = await pool.query<TodoRow>(
    `INSERT INTO todos (category, title, description) VALUES ($1, $2, $3) RETURNING ${TODO_COLUMNS}`,
    [input.category ?? null, input.title, input.description ?? null],
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
