import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Divider from "@mui/material/Divider";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { useTodos, useCreateTodo, useUpdateTodo, useDeleteTodo } from "../../hooks/useTodos";
import { useEmails, useMarkEmailRead } from "../../hooks/useEmails";
import { formatRelativeTime } from "../../utils/formatters";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { getErrorMessage } from "../../utils/getErrorMessage";
import type { Todo } from "../../types/todo.types";

interface ProjectOption {
  id: string;
  name: string;
}

// Todo-/Postfach-Panel unter KI-Buero (zweiter Reiter neben der Buero-
// Visualisierung, siehe AiOperationsOffice.tsx) - Nutzerwunsch: Todos je
// Projekt oder allgemein, plus Sichtbarkeit neuer E-Mails. Reine CRUD-
// Ansicht/Anzeige, keine neue Statuslogik.
export function TodosInboxPanel({ projects }: { projects: ProjectOption[] }) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "flex-start" }}>
      <Box sx={{ flex: "1 1 420px", minWidth: 320 }}>
        <TodosCard projects={projects} />
      </Box>
      <Box sx={{ flex: "1 1 420px", minWidth: 320 }}>
        <InboxCard />
      </Box>
    </Box>
  );
}

function TodosCard({ projects }: { projects: ProjectOption[] }) {
  const todosQuery = useTodos();
  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("");

  const projectNameById = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Todo[]>();
    for (const todo of todosQuery.data ?? []) {
      const key = todo.projectId ?? "__general__";
      const list = groups.get(key);
      if (list) list.push(todo);
      else groups.set(key, [todo]);
    }
    return groups;
  }, [todosQuery.data]);

  const handleAdd = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createTodo.mutate({ title: trimmed, projectId: projectId || null });
    setTitle("");
  };

  return (
    <Card>
      <CardHeader title="Todos" slotProps={{ title: { variant: "h6" } }} />
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TextField
            size="small"
            placeholder="Neues Todo..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            fullWidth
          />
          <TextField size="small" select value={projectId} onChange={(e) => setProjectId(e.target.value)} sx={{ minWidth: 140 }}>
            <MenuItem value="">Allgemein</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="contained" onClick={handleAdd} disabled={!title.trim() || createTodo.isPending}>
            Hinzufügen
          </Button>
        </Stack>

        {todosQuery.isLoading ? (
          <LoadingState label="Todos laden..." />
        ) : todosQuery.error ? (
          <ErrorState message={getErrorMessage(todosQuery.error)} onRetry={() => todosQuery.refetch()} />
        ) : (todosQuery.data ?? []).length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Keine Todos.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {[...grouped.entries()].map(([key, items]) => (
              <Box key={key}>
                <Typography variant="overline" color="text.secondary">
                  {key === "__general__" ? "Allgemein" : (projectNameById.get(key) ?? key)}
                </Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {items.map((todo) => (
                    <Stack key={todo.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Checkbox
                        size="small"
                        checked={todo.done}
                        onChange={(e) => updateTodo.mutate({ id: todo.id, input: { done: e.target.checked } })}
                      />
                      <Typography
                        variant="body2"
                        sx={{ flexGrow: 1, textDecoration: todo.done ? "line-through" : "none", color: todo.done ? "text.secondary" : "text.primary" }}
                      >
                        {todo.title}
                      </Typography>
                      <IconButton size="small" onClick={() => deleteTodo.mutate(todo.id)} aria-label="Todo löschen">
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function InboxCard() {
  const emailsQuery = useEmails(50);
  const markRead = useMarkEmailRead();

  return (
    <Card>
      <CardHeader title="Postfach" slotProps={{ title: { variant: "h6" } }} />
      <CardContent>
        {emailsQuery.isLoading ? (
          <LoadingState label="E-Mails laden..." />
        ) : emailsQuery.error ? (
          <ErrorState message={getErrorMessage(emailsQuery.error)} onRetry={() => emailsQuery.refetch()} />
        ) : (emailsQuery.data ?? []).length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Keine E-Mails synchronisiert. Prüfe IMAP_HOST/IMAP_USER/IMAP_PASSWORD auf dem Server, falls das unerwartet ist.
          </Typography>
        ) : (
          <Stack divider={<Divider />} spacing={0}>
            {(emailsQuery.data ?? []).map((email) => (
              <Box
                key={email.id}
                onClick={() => !email.read && markRead.mutate({ id: email.id, read: true })}
                sx={{ py: 1.25, cursor: email.read ? "default" : "pointer" }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  {!email.read ? (
                    <Box sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "primary.main", flexShrink: 0 }} />
                  ) : (
                    <Box sx={{ width: 7 }} />
                  )}
                  <Typography variant="body2" sx={{ fontWeight: email.read ? 400 : 700, flexGrow: 1 }} noWrap>
                    {email.subject || "(kein Betreff)"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {formatRelativeTime(email.receivedAt)}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                  {email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}
                </Typography>
                {email.snippet ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                    {email.snippet}
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
