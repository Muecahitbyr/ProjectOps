import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { useTodos, useTodoCategories, useCreateTodo, useUpdateTodo, useDeleteTodo } from "../../hooks/useTodos";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { getErrorMessage } from "../../utils/getErrorMessage";
import type { Todo } from "../../types/todo.types";

const GENERAL_KEY = "__general__";
const CATEGORY_LIST_ID = "todo-category-suggestions";

// Deterministische Akzentfarbe je Kategorie (Hash des Namens) - rein
// dekorativ, keine echte Bedeutung der Farbe selbst, nur Wiedererkennung
// zwischen den Gruppen.
const CATEGORY_COLORS = ["#3b82f6", "#f97316", "#10b981", "#a855f7", "#eab308", "#ec4899", "#14b8a6", "#ef4444"];
function colorForCategory(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length]!;
}

// Todo-Panel unter KI-Buero (zweiter Reiter neben der Buero-Visualisierung,
// siehe AiOperationsOffice.tsx). Kategorie ist freier Text statt an die vier
// ueberwachten Projekte gebunden (Migration 0067) - deckt auch eigene
// Vorhaben ausserhalb von ProjectOps ab (z.B. "cmd Gebäudereinigung").
// Gleicher Card/Grid-Stil wie Settings.tsx, statt einer eigenen Optik.
export function TodosPanel({ projects }: { projects: { id: string; name: string }[] }) {
  const todosQuery = useTodos();
  const categoriesQuery = useTodoCategories();
  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");

  // Vorschlagsliste (natives <datalist>, kein MUI Autocomplete - das hatte
  // hier ein sichtbares Rendering-Problem mit seinem Clear-Icon): bereits
  // genutzte Kategorien + Namen der echten ueberwachten Projekte,
  // dedupliziert. Freie Eingabe bleibt trotzdem jederzeit moeglich.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>(categoriesQuery.data ?? []);
    for (const p of projects) set.add(p.name);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [categoriesQuery.data, projects]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Todo[]>();
    for (const todo of todosQuery.data ?? []) {
      const key = todo.category ?? GENERAL_KEY;
      const list = groups.get(key);
      if (list) list.push(todo);
      else groups.set(key, [todo]);
    }
    return groups;
  }, [todosQuery.data]);

  const total = (todosQuery.data ?? []).length;
  const openCount = (todosQuery.data ?? []).filter((t) => !t.done).length;

  const handleAdd = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createTodo.mutate({ title: trimmed, category: category.trim() || null });
    setTitle("");
    setCategory("");
  };

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 8 }}>
        <Card>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 2 }}>
              <Typography variant="h3">Todos</Typography>
              <Typography variant="body2" color="text.secondary">
                {total === 0 ? "Keine Todos" : openCount === 0 ? "Alles erledigt" : `${openCount} von ${total} offen`}
              </Typography>
            </Stack>

            <datalist id={CATEGORY_LIST_ID}>
              {categoryOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>

            <Stack spacing={1.25} sx={{ mb: 3 }}>
              <TextField
                size="small"
                placeholder="Neues Todo..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                fullWidth
              />
              <Stack direction="row" spacing={1.25}>
                <TextField
                  size="small"
                  placeholder="Kategorie (optional)"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  slotProps={{ htmlInput: { list: CATEGORY_LIST_ID } }}
                  fullWidth
                />
                <Button
                  variant="contained"
                  onClick={handleAdd}
                  disabled={!title.trim() || createTodo.isPending}
                  sx={{ whiteSpace: "nowrap", flexShrink: 0, px: 3 }}
                >
                  Hinzufügen
                </Button>
              </Stack>
            </Stack>

            {todosQuery.isLoading ? (
              <LoadingState label="Todos laden..." minHeight={120} />
            ) : todosQuery.error ? (
              <ErrorState message={getErrorMessage(todosQuery.error)} onRetry={() => todosQuery.refetch()} minHeight={120} />
            ) : total === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
                Noch keine Todos angelegt.
              </Typography>
            ) : (
              <Stack spacing={2.5}>
                {[...grouped.entries()].map(([key, items], index) => {
                  const label = key === GENERAL_KEY ? "Allgemein" : key;
                  const accent = key === GENERAL_KEY ? "#9ca3af" : colorForCategory(label);
                  return (
                    <Box key={key}>
                      {index > 0 ? <Divider sx={{ mb: 2.5 }} /> : null}
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: accent, flexShrink: 0 }} />
                        <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: "0.06em", color: "text.secondary" }}>
                          {label}
                        </Typography>
                        <Chip label={items.length} size="small" sx={{ height: 18, fontSize: "0.65rem" }} />
                      </Stack>
                      <Stack spacing={0.5}>
                        {items.map((todo) => (
                          <Stack
                            key={todo.id}
                            direction="row"
                            spacing={1}
                            sx={{
                              alignItems: "center",
                              borderRadius: 2,
                              px: 1,
                              "&:hover": { backgroundColor: "action.hover" },
                              "&:hover .todo-delete": { opacity: 1 },
                            }}
                          >
                            <Checkbox
                              size="small"
                              checked={todo.done}
                              onChange={(e) => updateTodo.mutate({ id: todo.id, input: { done: e.target.checked } })}
                            />
                            <Typography
                              variant="body2"
                              sx={{
                                flexGrow: 1,
                                textDecoration: todo.done ? "line-through" : "none",
                                color: todo.done ? "text.disabled" : "text.primary",
                              }}
                            >
                              {todo.title}
                            </Typography>
                            <IconButton
                              className="todo-delete"
                              size="small"
                              onClick={() => deleteTodo.mutate(todo.id)}
                              aria-label="Todo löschen"
                              sx={{ opacity: { xs: 1, sm: 0 }, transition: "opacity 0.15s ease" }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
