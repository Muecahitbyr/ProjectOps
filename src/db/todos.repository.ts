import { pool } from "./pool";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "../types/todo.types";

interface TodoRow {
  id: string | number;
  category: string | null;
  title: string;
  description: string | null;
  done: boolean;
  due_date: string | Date | null;
  needs_testing: boolean;
  position: string | number;
  created_at: string | Date;
  updated_at: string | Date;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toDateOnlyString(value: string | Date | null): string | null {
  if (value === null) return null;
  const iso = value instanceof Date ? value.toISOString() : value;
  return iso.slice(0, 10);
}

// BIGSERIAL-Id/BIGINT-position kommen vom pg-Treiber als String zurueck -
// explizit zu Number gewandelt (siehe CLAUDE.md BIGSERIAL/BIGINT-Konvention).
function mapRow(row: TodoRow): Todo {
  return {
    id: Number(row.id),
    category: row.category,
    title: row.title,
    description: row.description,
    done: row.done,
    dueDate: toDateOnlyString(row.due_date),
    needsTesting: row.needs_testing,
    position: Number(row.position),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

const TODO_COLUMNS = `id, category, title, description, done, due_date, needs_testing, position, created_at, updated_at`;

export async function listTodos(options: { category?: string } = {}): Promise<Todo[]> {
  if (options.category) {
    const { rows } = await pool.query<TodoRow>(
      `SELECT ${TODO_COLUMNS} FROM todos WHERE category = $1 ORDER BY done ASC, position ASC`,
      [options.category],
    );
    return rows.map(mapRow);
  }
  const { rows } = await pool.query<TodoRow>(`SELECT ${TODO_COLUMNS} FROM todos ORDER BY done ASC, position ASC`);
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
  const { rows: maxRows } = await pool.query<{ max: string | null }>(`SELECT MAX(position) AS max FROM todos`);
  const nextPosition = (maxRows[0]?.max ? Number(maxRows[0].max) : 0) + 1;

  const { rows } = await pool.query<TodoRow>(
    `INSERT INTO todos (category, title, description, due_date, position) VALUES ($1, $2, $3, $4, $5) RETURNING ${TODO_COLUMNS}`,
    [input.category ?? null, input.title, input.description ?? null, input.dueDate ?? null, nextPosition],
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
  if (input.dueDate !== undefined) {
    values.push(input.dueDate);
    sets.push(`due_date = $${values.length}`);
  }
  if (input.needsTesting !== undefined) {
    values.push(input.needsTesting);
    sets.push(`needs_testing = $${values.length}`);
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

// Per Drag&Drop (Touch oder Maus, siehe TodosPanel.tsx) neu sortierte
// Reihenfolge INNERHALB einer Kategorie persistieren. orderedIds ist die
// komplette neue Reihenfolge der Todo-Ids dieser Kategorie. Die schon
// vorhandenen position-Werte dieser Kategorie werden lediglich neu
// VERTEILT (nicht neu erfunden) - andere Kategorien bleiben unberuehrt.
export async function reorderTodos(category: string | null, orderedIds: number[]): Promise<Todo[]> {
  const categoryCondition = category === null ? "category IS NULL" : "category = $1";
  const params = category === null ? [] : [category];
  const { rows } = await pool.query<TodoRow>(
    `SELECT ${TODO_COLUMNS} FROM todos WHERE ${categoryCondition} ORDER BY position ASC`,
    params,
  );
  const existing = rows.map(mapRow);
  const positions = existing.map((t) => t.position);

  // Nur echte Mitglieder dieser Kategorie beruecksichtigen; fehlende IDs
  // (z.B. durch eine zwischenzeitliche Aenderung) werden hinten in ihrer
  // bisherigen Reihenfolge angehaengt, statt sie zu verlieren.
  const knownIds = new Set(existing.map((t) => t.id));
  const validOrderedIds = orderedIds.filter((id) => knownIds.has(id));
  const remainingIds = existing.map((t) => t.id).filter((id) => !validOrderedIds.includes(id));
  const finalOrder = [...validOrderedIds, ...remainingIds];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < finalOrder.length; i++) {
      await client.query(`UPDATE todos SET position = $1, updated_at = now() WHERE id = $2`, [positions[i], finalOrder[i]]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const updated = await Promise.all(finalOrder.map((id) => getTodoById(id)));
  return updated.filter((t): t is Todo => t !== undefined);
}
