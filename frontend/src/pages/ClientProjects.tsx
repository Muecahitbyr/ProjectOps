import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Alert from "@mui/material/Alert";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import Divider from "@mui/material/Divider";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { TodosPanel } from "../components/ai-office/TodosPanel";
import { getErrorMessage } from "../utils/getErrorMessage";
import { useClientProjects, useCreateClientProject, useDeleteClientProject, useUpdateClientProject } from "../hooks/useClientProjects";
import type { ClientProject, CreateClientProjectInput } from "../types/client-project.types";

// Leeres Formular als Konstante statt an 5 Stellen "" zu wiederholen.
const EMPTY_FORM = { name: "", adminLoginUrl: "", adminLoginUsername: "", adminLoginPassword: "", notes: "" };
type ProjectFormState = typeof EMPTY_FORM;

function toInput(form: ProjectFormState): CreateClientProjectInput {
  return {
    name: form.name.trim(),
    adminLoginUrl: form.adminLoginUrl.trim() || null,
    adminLoginUsername: form.adminLoginUsername.trim() || null,
    adminLoginPassword: form.adminLoginPassword.trim() || null,
    notes: form.notes.trim() || null,
  };
}

function toForm(project: ClientProject): ProjectFormState {
  return {
    name: project.name,
    adminLoginUrl: project.adminLoginUrl ?? "",
    adminLoginUsername: project.adminLoginUsername ?? "",
    adminLoginPassword: project.adminLoginPassword ?? "",
    notes: project.notes ?? "",
  };
}

// Eine Zeile "Zugangsdaten"-Anzeige (URL/Benutzername/Passwort) mit Kopieren-
// Button - Passwort zusaetzlich maskiert mit Augen-Icon zum Aufdecken
// (Nutzerwunsch: Admin-Login hinterlegen, ohne dass er beim Vorbeischauen
// am Bildschirm immer offen auf der Seite steht).
function CredentialRow({ label, value, isLink, isSecret }: { label: string; value: string; isLink?: boolean; isSecret?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const masked = isSecret && !revealed;

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 92, flexShrink: 0 }}>
        {label}
      </Typography>
      {isLink ? (
        <Typography
          component="a"
          href={value.startsWith("http") ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          variant="body2"
          sx={{ flexGrow: 1, minWidth: 0, overflowWrap: "break-word", color: "primary.main" }}
        >
          {value}
        </Typography>
      ) : (
        <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0, overflowWrap: "break-word", fontFamily: masked ? "inherit" : "monospace" }}>
          {masked ? "••••••••" : value}
        </Typography>
      )}
      {isSecret && (
        <Tooltip title={revealed ? "Verstecken" : "Anzeigen"}>
          <IconButton size="small" onClick={() => setRevealed((r) => !r)}>
            {revealed ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      )}
      {isLink && (
        <Tooltip title="In neuem Tab öffnen">
          <IconButton size="small" component="a" href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer">
            <OpenInNewOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="Kopieren">
        <IconButton size="small" onClick={() => void navigator.clipboard.writeText(value)}>
          <ContentCopyOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function ProjectEditForm({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  form: ProjectFormState;
  onChange: (form: ProjectFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <Stack spacing={1.5}>
      <TextField size="small" label="Name" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} fullWidth autoFocus />
      <TextField
        size="small"
        label="Admin-Login URL"
        placeholder="z.B. https://meineseite.de/wp-admin"
        value={form.adminLoginUrl}
        onChange={(e) => onChange({ ...form, adminLoginUrl: e.target.value })}
        fullWidth
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField
          size="small"
          label="Benutzername"
          value={form.adminLoginUsername}
          onChange={(e) => onChange({ ...form, adminLoginUsername: e.target.value })}
          fullWidth
        />
        <TextField
          size="small"
          label="Passwort"
          value={form.adminLoginPassword}
          onChange={(e) => onChange({ ...form, adminLoginPassword: e.target.value })}
          fullWidth
        />
      </Stack>
      <TextField
        size="small"
        label="Notizen"
        placeholder="Allgemeine Notizen zum Kunden/Projekt..."
        value={form.notes}
        onChange={(e) => onChange({ ...form, notes: e.target.value })}
        fullWidth
        multiline
        minRows={3}
      />
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
        <Button onClick={onCancel} disabled={saving}>
          Abbrechen
        </Button>
        <Button variant="contained" onClick={onSave} disabled={!form.name.trim() || saving}>
          Speichern
        </Button>
      </Stack>
    </Stack>
  );
}

function ProjectAccordion({
  project,
  onSave,
  onDelete,
}: {
  project: ClientProject;
  onSave: (id: number, input: CreateClientProjectInput) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProjectFormState>(() => toForm(project));
  const hasCredentials = !!(project.adminLoginUrl || project.adminLoginUsername || project.adminLoginPassword);

  function startEditing() {
    setForm(toForm(project));
    setEditing(true);
  }

  function handleSave() {
    onSave(project.id, toInput(form));
    setEditing(false);
  }

  return (
    <Accordion
      disableGutters
      variant="outlined"
      // Beim erneuten Oeffnen nach dem Schliessen (ohne zu speichern) soll
      // der Entwurf verworfen sein, nicht die zuletzt eingegebenen, nicht
      // gespeicherten Aenderungen zeigen.
      onChange={(_e, expanded) => {
        if (!expanded) setEditing(false);
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexGrow: 1, minWidth: 0 }}>
          {hasCredentials && <LockOutlinedIcon fontSize="small" color="action" />}
          <Typography variant="subtitle1" sx={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {project.name}
          </Typography>
        </Stack>
        <Tooltip title="Projekt löschen">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Projekt "${project.name}" wirklich löschen? Zugangsdaten und Notizen gehen verloren.`)) {
                onDelete(project.id);
              }
            }}
          >
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </AccordionSummary>
      <AccordionDetails>
        {editing ? (
          <ProjectEditForm form={form} onChange={setForm} onSave={handleSave} onCancel={() => setEditing(false)} saving={false} />
        ) : (
          <Stack spacing={2}>
            <Stack spacing={1}>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                  Zugangsdaten
                </Typography>
                <Tooltip title="Bearbeiten">
                  <IconButton size="small" onClick={startEditing}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              {hasCredentials ? (
                <Stack spacing={0.75}>
                  {project.adminLoginUrl && <CredentialRow label="URL" value={project.adminLoginUrl} isLink />}
                  {project.adminLoginUsername && <CredentialRow label="Benutzername" value={project.adminLoginUsername} />}
                  {project.adminLoginPassword && <CredentialRow label="Passwort" value={project.adminLoginPassword} isSecret />}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Keine Zugangsdaten hinterlegt.
                </Typography>
              )}
            </Stack>
            <Divider />
            <Stack spacing={0.5}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                Notizen
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", color: project.notes ? "text.primary" : "text.secondary" }}>
                {project.notes || "Keine Notizen."}
              </Typography>
            </Stack>
          </Stack>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

// "Projekte" (Nutzerwunsch 2026-10-06): ersetzt den bisherigen "Todos"-Nav-
// Eintrag. Admin-Zugangsdaten + Notizen je Kundenprojekt (neu) UND die
// bestehende Todo-Verwaltung (TodosPanel.tsx, unveraendert wiederverwendet -
// "reuse, compose, don't re-engine") auf einer Seite: TodosPanel gruppiert
// Todos bereits anhand des freien todos.category-Textfelds, hier als
// "projects"-Prop einfach die Namen dieser neuen Projekte statt der echten
// ueberwachten ProjectOps-Projekte (die sind seit der Sidebar-Verschlankung
// kein aktiver Nav-Eintrag mehr, siehe Sidebar.tsx).
export function ClientProjects() {
  const projectsQuery = useClientProjects();
  const createProject = useCreateClientProject();
  const updateProject = useUpdateClientProject();
  const deleteProject = useDeleteClientProject();

  const [newProjectForm, setNewProjectForm] = useState<ProjectFormState>(EMPTY_FORM);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);

  const projects = projectsQuery.data ?? [];
  // Keine kleine Liste wert, ueber useMemo zu cachen (und projects ist bei
  // jedem Render ohnehin eine neue Array-Referenz aus projectsQuery.data).
  const todoProjectOptions = projects.map((p) => ({ id: String(p.id), name: p.name }));

  function handleCreate() {
    if (!newProjectForm.name.trim()) return;
    createProject.mutate(toInput(newProjectForm), {
      onSuccess: () => {
        setNewProjectForm(EMPTY_FORM);
        setShowNewProjectForm(false);
      },
    });
  }

  if (projectsQuery.isLoading) {
    return (
      <PageContainer title="Projekte">
        <LoadingState label="Projekte laden..." />
      </PageContainer>
    );
  }

  if (projectsQuery.error) {
    return (
      <PageContainer title="Projekte">
        <ErrorState message={getErrorMessage(projectsQuery.error)} onRetry={() => projectsQuery.refetch()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Projekte">
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardHeader
          title={`Projekte (${projects.length})`}
          slotProps={{ title: { variant: "h6" } }}
          action={
            !showNewProjectForm && (
              <Button size="small" variant="contained" onClick={() => setShowNewProjectForm(true)}>
                + Neues Projekt
              </Button>
            )
          }
        />
        <CardContent sx={{ pt: 0 }}>
          {showNewProjectForm && (
            <Box sx={{ mb: 3, p: 2, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
              <ProjectEditForm
                form={newProjectForm}
                onChange={setNewProjectForm}
                onSave={handleCreate}
                onCancel={() => {
                  setNewProjectForm(EMPTY_FORM);
                  setShowNewProjectForm(false);
                }}
                saving={createProject.isPending}
              />
              {createProject.isError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {getErrorMessage(createProject.error)}
                </Alert>
              )}
            </Box>
          )}

          {projects.length === 0 && !showNewProjectForm ? (
            <Typography variant="body2" color="text.secondary">
              Noch keine Projekte angelegt.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {projects.map((project) => (
                <ProjectAccordion
                  key={project.id}
                  project={project}
                  onSave={(id, input) => updateProject.mutate({ id, input })}
                  onDelete={(id) => deleteProject.mutate(id)}
                />
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <TodosPanel projects={todoProjectOptions} />
    </PageContainer>
  );
}
