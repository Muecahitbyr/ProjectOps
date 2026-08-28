import { logger } from "./logger";
import { listTodos } from "../db/todos.repository";
import { sendNtfyNotification } from "../notifications/ntfy-transport";
import type { Todo } from "../types/todo.types";

// Nutzerwunsch: taeglich um 17 Uhr (konfigurierbar, TODO_DIGEST_HOUR) eine
// Push mit den noch offenen Todos - Europe/Berlin explizit statt Server-
// Zeitzone (Hetzner-Server laeuft auf UTC), damit "17 Uhr" wirklich die
// eigene Uhrzeit des Nutzers meint, unabhaengig von der Server-Systemzeit.
const DIGEST_HOUR = Number(process.env.TODO_DIGEST_HOUR) || 17;
const TIMEZONE = "Europe/Berlin";
const CHECK_INTERVAL_MS = 60_000;

function berlinNow(): { dateKey: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

// dueDate liegt als YYYY-MM-DD vor (DB-DATE-Spalte, siehe todos.repository.ts)
// - fuer die Anzeige deutsches Format statt des rohen ISO-Strings.
function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split("-");
  return `${day}.${month}.${year}`;
}

function buildDigestMessage(openTodos: Todo[]): string {
  if (openTodos.length === 0) {
    return "Keine offenen Todos.";
  }

  const groups = new Map<string, Todo[]>();
  for (const todo of openTodos) {
    const key = todo.category ?? "Allgemein";
    const list = groups.get(key);
    if (list) list.push(todo);
    else groups.set(key, [todo]);
  }

  const lines: string[] = [];
  for (const [category, todos] of groups) {
    lines.push(`${category}:`);
    for (const todo of todos) {
      const suffix = todo.dueDate ? ` (bis ${formatDueDate(todo.dueDate)})` : "";
      lines.push(`  • ${todo.title}${suffix}`);
    }
  }
  return lines.join("\n");
}

async function sendDigest(): Promise<void> {
  const allTodos = await listTodos();
  const openTodos = allTodos.filter((todo) => !todo.done);
  const testingCount = allTodos.filter((todo) => todo.needsTesting && !todo.done).length;

  const title = `Todos: ${openTodos.length} offen${testingCount > 0 ? `, ${testingCount} zu testen` : ""}`;
  await sendNtfyNotification({
    title,
    message: buildDigestMessage(openTodos),
    priority: 3,
    tags: ["clipboard"],
  });
}

let lastSentDateKey: string | undefined;
let intervalHandle: ReturnType<typeof setInterval> | undefined;

async function tick(): Promise<void> {
  const { dateKey, hour } = berlinNow();
  if (hour !== DIGEST_HOUR || dateKey === lastSentDateKey) return;

  try {
    await sendDigest();
    lastSentDateKey = dateKey;
    logger.info("Taeglicher Todo-Digest gesendet", { dateKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    logger.error("Taeglicher Todo-Digest fehlgeschlagen", { error: message });
  }
}

export function startTodoDigest(): void {
  intervalHandle = setInterval(() => void tick(), CHECK_INTERVAL_MS);
  logger.info("Todo-Digest-Scheduler gestartet", { hour: DIGEST_HOUR, timezone: TIMEZONE });
}

export function stopTodoDigest(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
}
