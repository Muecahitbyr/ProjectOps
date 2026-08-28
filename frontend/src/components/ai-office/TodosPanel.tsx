import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
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
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import type { Dayjs } from "dayjs";
import "dayjs/locale/de";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTodos, useTodoCategories, useCreateTodo, useUpdateTodo, useDeleteTodo, useReorderTodos } from "../../hooks/useTodos";
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

function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split("-");
  return `${day}.${month}.${year!.slice(2)}`;
}

function isOverdue(dueDate: string): boolean {
  return dueDate < new Date().toISOString().slice(0, 10);
}

// Eine Zeile in der draggable Liste - Drag-Griff ist ein eigenes Element
// (nicht die ganze Zeile), damit Checkbox/Loeschen weiterhin per Antippen
// funktionieren und nicht mit dem Ziehen kollidieren.
function SortableTodoRow({ todo, onToggle, onDelete }: { todo: Todo; onToggle: (checked: boolean) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });

  return (
    <Stack
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      direction="row"
      spacing={0.25}
      sx={{
        alignItems: "center",
        borderRadius: 2,
        px: 0.5,
        backgroundColor: isDragging ? "action.selected" : "transparent",
        "&:hover": { backgroundColor: isDragging ? "action.selected" : "action.hover" },
        "&:hover .todo-actions": { opacity: 1 },
      }}
    >
      <Box
        {...attributes}
        {...listeners}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 40,
          flexShrink: 0,
          color: "text.disabled",
          cursor: "grab",
          touchAction: "none",
          "&:active": { cursor: "grabbing" },
        }}
        aria-label="Verschieben"
      >
        <DragIndicatorIcon fontSize="small" />
      </Box>
      <Checkbox size="small" checked={todo.done} onChange={(e) => onToggle(e.target.checked)} />
      <Typography
        variant="body2"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          overflowWrap: "break-word",
          textDecoration: todo.done ? "line-through" : "none",
          color: todo.done ? "text.disabled" : "text.primary",
        }}
      >
        {todo.title}
      </Typography>
      {todo.dueDate && !todo.done ? (
        <Chip
          label={`bis ${formatDueDate(todo.dueDate)}`}
          size="small"
          sx={{
            height: 20,
            fontSize: "0.62rem",
            flexShrink: 0,
            backgroundColor: isOverdue(todo.dueDate) ? "#ef44441f" : "action.hover",
            color: isOverdue(todo.dueDate) ? "#ef4444" : "text.secondary",
            fontWeight: isOverdue(todo.dueDate) ? 700 : 400,
          }}
        />
      ) : null}
      <IconButton
        className="todo-actions"
        size="small"
        onClick={onDelete}
        aria-label="Todo löschen"
        sx={{ opacity: { xs: 1, sm: 0 }, transition: "opacity 0.15s ease", flexShrink: 0 }}
      >
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

interface CategoryGroupProps {
  categoryKey: string;
  label: string;
  openItems: Todo[];
  doneItems: Todo[];
  onToggle: (todo: Todo, checked: boolean) => void;
  onDelete: (id: number) => void;
  onReorder: (category: string | null, orderedIds: number[]) => void;
}

function CategoryGroup({ categoryKey, label, openItems, doneItems, onToggle, onDelete, onReorder }: CategoryGroupProps) {
  const accent = categoryKey === GENERAL_KEY ? "#9ca3af" : colorForCategory(label);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = openItems.findIndex((t) => t.id === active.id);
    const newIndex = openItems.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...openItems];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved!);
    onReorder(categoryKey === GENERAL_KEY ? null : categoryKey, reordered.map((t) => t.id));
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: accent, flexShrink: 0 }} />
        <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: "0.06em", color: "text.secondary" }}>
          {label}
        </Typography>
        <Chip label={openItems.length + doneItems.length} size="small" sx={{ height: 18, fontSize: "0.65rem" }} />
      </Stack>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={openItems.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <Stack spacing={0.25}>
            {openItems.map((todo) => (
              <SortableTodoRow key={todo.id} todo={todo} onToggle={(checked) => onToggle(todo, checked)} onDelete={() => onDelete(todo.id)} />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>

      {doneItems.length > 0 ? (
        <Stack spacing={0.25} sx={{ mt: openItems.length > 0 ? 0.5 : 0 }}>
          {doneItems.map((todo) => (
            <Stack
              key={todo.id}
              direction="row"
              spacing={0.25}
              sx={{ alignItems: "center", borderRadius: 2, pl: "40px", pr: 0.5, "&:hover .todo-actions": { opacity: 1 } }}
            >
              <Checkbox size="small" checked={todo.done} onChange={(e) => onToggle(todo, e.target.checked)} />
              <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0, textDecoration: "line-through", color: "text.disabled" }}>
                {todo.title}
              </Typography>
              <IconButton
                className="todo-actions"
                size="small"
                onClick={() => onDelete(todo.id)}
                aria-label="Todo löschen"
                sx={{ opacity: { xs: 1, sm: 0 }, transition: "opacity 0.15s ease", flexShrink: 0 }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}

// Todo-Panel unter KI-Buero (eigene Seite/Nav-Eintrag, siehe pages/Todos.tsx).
// Deadline ueber einen echten MUI-DatePicker (@mui/x-date-pickers) statt des
// haesslichen nativen <input type="date">; Reihenfolge per Drag&Drop
// (@dnd-kit, funktioniert per Maus UND per Touch/Finger) statt Pfeiltasten.
export function TodosPanel({ projects }: { projects: { id: string; name: string }[] }) {
  const todosQuery = useTodos();
  const categoriesQuery = useTodoCategories();
  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const reorderTodos = useReorderTodos();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [dueDate, setDueDate] = useState<Dayjs | null>(null);
  const [pendingTestPrompt, setPendingTestPrompt] = useState<Todo | null>(null);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(categoriesQuery.data ?? []);
    for (const p of projects) set.add(p.name);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [categoriesQuery.data, projects]);

  const allTodos = todosQuery.data ?? [];
  const activeTodos = allTodos.filter((t) => !t.done && !t.needsTesting);
  const doneTodos = allTodos.filter((t) => t.done);
  const testingTodos = allTodos.filter((t) => t.needsTesting && !t.done);

  const grouped = useMemo(() => {
    const groups = new Map<string, { open: Todo[]; done: Todo[] }>();
    for (const todo of activeTodos) {
      const key = todo.category ?? GENERAL_KEY;
      const entry = groups.get(key) ?? { open: [], done: [] };
      entry.open.push(todo);
      groups.set(key, entry);
    }
    for (const todo of doneTodos) {
      const key = todo.category ?? GENERAL_KEY;
      const entry = groups.get(key) ?? { open: [], done: [] };
      entry.done.push(todo);
      groups.set(key, entry);
    }
    for (const entry of groups.values()) entry.open.sort((a, b) => a.position - b.position);
    return groups;
  }, [activeTodos, doneTodos]);

  const openCount = activeTodos.length + testingTodos.length;

  const handleAdd = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createTodo.mutate({ title: trimmed, category: category.trim() || null, dueDate: dueDate ? dueDate.format("YYYY-MM-DD") : null });
    setTitle("");
    setCategory("");
    setDueDate(null);
  };

  const handleToggle = (todo: Todo, checked: boolean) => {
    if (!checked) {
      updateTodo.mutate({ id: todo.id, input: { done: false, needsTesting: false } });
      return;
    }
    setPendingTestPrompt(todo);
  };

  const resolveTestPrompt = (needsTesting: boolean) => {
    if (!pendingTestPrompt) return;
    if (needsTesting) {
      updateTodo.mutate({ id: pendingTestPrompt.id, input: { needsTesting: true } });
    } else {
      updateTodo.mutate({ id: pendingTestPrompt.id, input: { done: true } });
    }
    setPendingTestPrompt(null);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="de">
      <Grid container spacing={{ xs: 2, sm: 3 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 2, flexWrap: "wrap", rowGap: 0.5 }}>
                <Typography variant="h3">Todos</Typography>
                <Typography variant="body2" color="text.secondary">
                  {allTodos.length === 0 ? "Keine Todos" : openCount === 0 ? "Alles erledigt" : `${openCount} offen`}
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
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                  <TextField
                    size="small"
                    placeholder="Kategorie (optional)"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    slotProps={{ htmlInput: { list: CATEGORY_LIST_ID } }}
                    sx={{ flex: "1 1 auto", minWidth: 0 }}
                  />
                  <DatePicker
                    label="Erledigen bis"
                    value={dueDate}
                    onChange={(value) => setDueDate(value)}
                    format="DD.MM.YYYY"
                    slotProps={{ textField: { size: "small" } }}
                    sx={{ width: { xs: "100%", sm: 170 }, flexShrink: 0 }}
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
              ) : allTodos.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
                  Noch keine Todos angelegt.
                </Typography>
              ) : (
                <Stack spacing={2.5}>
                  {[...grouped.entries()].map(([key, { open, done }], index) => (
                    <Box key={key}>
                      {index > 0 ? <Divider sx={{ mb: 2.5 }} /> : null}
                      <CategoryGroup
                        categoryKey={key}
                        label={key === GENERAL_KEY ? "Allgemein" : key}
                        openItems={open}
                        doneItems={done}
                        onToggle={handleToggle}
                        onDelete={(id) => deleteTodo.mutate(id)}
                        onReorder={(cat, orderedIds) => reorderTodos.mutate({ category: cat, orderedIds })}
                      />
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {testingTodos.length > 0 ? (
          <Grid size={{ xs: 12, md: 8 }}>
            <Card sx={{ borderColor: "#eab308", borderWidth: 1, borderStyle: "solid" }}>
              <CardHeader
                title="Zu testen"
                subheader={`${testingTodos.length} wartet auf Test`}
                slotProps={{ title: { variant: "h6" } }}
                sx={{ p: { xs: 2, sm: 3 }, pb: 0 }}
              />
              <CardContent sx={{ pt: 0, p: { xs: 2, sm: 3 } }}>
                <Stack spacing={0.5}>
                  {testingTodos.map((todo) => (
                    <Stack
                      key={todo.id}
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", borderRadius: 2, px: 1, flexWrap: "wrap", "&:hover": { backgroundColor: "action.hover" } }}
                    >
                      <Checkbox size="small" checked={false} onChange={() => updateTodo.mutate({ id: todo.id, input: { done: true } })} />
                      <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0, overflowWrap: "break-word" }}>
                        {todo.title}
                      </Typography>
                      <Chip
                        label={todo.category ?? "Allgemein"}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: "0.62rem",
                          backgroundColor: `${colorForCategory(todo.category ?? "Allgemein")}1f`,
                          color: colorForCategory(todo.category ?? "Allgemein"),
                          fontWeight: 700,
                        }}
                      />
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ) : null}

        <Dialog open={pendingTestPrompt !== null} onClose={() => setPendingTestPrompt(null)} fullWidth maxWidth="xs">
          <DialogTitle>Muss das getestet werden?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              {pendingTestPrompt ? `"${pendingTestPrompt.title}"` : ""} — wenn ja, wandert es in den Bereich "Zu testen", statt
              direkt als erledigt zu gelten.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => resolveTestPrompt(false)}>Nein</Button>
            <Button onClick={() => resolveTestPrompt(true)} variant="contained">
              Ja
            </Button>
          </DialogActions>
        </Dialog>
      </Grid>
    </LocalizationProvider>
  );
}
