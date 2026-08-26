import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Fade from "@mui/material/Fade";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";
import ChecklistIcon from "@mui/icons-material/ChecklistOutlined";
import { useTodos, useTodoCategories, useCreateTodo, useUpdateTodo, useDeleteTodo } from "../../hooks/useTodos";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { getErrorMessage } from "../../utils/getErrorMessage";
import type { Todo } from "../../types/todo.types";

const GENERAL_KEY = "__general__";

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
export function TodosPanel({ projects }: { projects: { id: string; name: string }[] }) {
  const todosQuery = useTodos();
  const categoriesQuery = useTodoCategories();
  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("");

  // Vorschlagsliste: bereits genutzte Kategorien + Namen der echten
  // ueberwachten Projekte, dedupliziert - Autocomplete bleibt trotzdem
  // freeSolo, jede beliebige Eingabe ist erlaubt.
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

  const openCount = (todosQuery.data ?? []).filter((t) => !t.done).length;

  const handleAdd = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createTodo.mutate({ title: trimmed, category: category.trim() || null });
    setTitle("");
    setCategory("");
  };

  return (
    <Box sx={{ maxWidth: 680 }}>
      <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              backgroundColor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ChecklistIcon sx={{ color: "primary.contrastText", fontSize: 20 }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              Todos
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {openCount === 0 ? "Alles erledigt" : `${openCount} offen`}
            </Typography>
          </Box>
        </Stack>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ mb: 3 }}>
          <TextField
            size="small"
            placeholder="Neues Todo..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            fullWidth
          />
          <Autocomplete
            size="small"
            freeSolo
            options={categoryOptions}
            value={category}
            onInputChange={(_e, value) => setCategory(value)}
            sx={{ minWidth: { sm: 180 } }}
            renderInput={(params) => <TextField {...params} placeholder="Kategorie" />}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            disabled={!title.trim() || createTodo.isPending}
            sx={{ whiteSpace: "nowrap" }}
          >
            Hinzufügen
          </Button>
        </Stack>

        {todosQuery.isLoading ? (
          <LoadingState label="Todos laden..." />
        ) : todosQuery.error ? (
          <ErrorState message={getErrorMessage(todosQuery.error)} onRetry={() => todosQuery.refetch()} />
        ) : (todosQuery.data ?? []).length === 0 ? (
          <Box sx={{ textAlign: "center", py: 5 }}>
            <ChecklistIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Noch keine Todos.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={3}>
            {[...grouped.entries()].map(([key, items]) => {
              const label = key === GENERAL_KEY ? "Allgemein" : key;
              const accent = key === GENERAL_KEY ? "#9ca3af" : colorForCategory(label);
              return (
                <Box key={key}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: accent, flexShrink: 0 }} />
                    <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: "0.06em", color: "text.secondary" }}>
                      {label}
                    </Typography>
                    <Chip
                      label={items.length}
                      size="small"
                      sx={{ height: 18, fontSize: "0.65rem", backgroundColor: "action.hover" }}
                    />
                  </Stack>
                  <Stack spacing={0.5}>
                    {items.map((todo) => (
                      <Fade in key={todo.id}>
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{
                            alignItems: "center",
                            borderRadius: 2,
                            px: 1,
                            py: 0.25,
                            transition: "background-color 0.15s ease",
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
                            sx={{ opacity: 0, transition: "opacity 0.15s ease" }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Fade>
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
