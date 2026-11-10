import { useMemo, useState } from "react";
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
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import MenuItem from "@mui/material/MenuItem";
import Collapse from "@mui/material/Collapse";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import WorkOutlineIcon from "@mui/icons-material/WorkOutlineOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import HighlightOffIcon from "@mui/icons-material/HighlightOffOutlined";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmptyOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { getErrorMessage } from "../utils/getErrorMessage";
import {
  useCreateJobApplication,
  useDeleteJobApplication,
  useJobApplications,
  useUpdateJobApplication,
} from "../hooks/useJobApplications";
import type { CreateJobApplicationInput, JobApplication, JobApplicationStatus } from "../types/job-application.types";

// Hauptzweck dieser Seite (Nutzerwunsch): VOR einer neuen Bewerbung schnell
// nachschauen koennen, ob man sich bei dieser Firma schon einmal beworben
// hat - die Suche steht deshalb bewusst ganz oben, nicht die Liste.
const STATUS_CONFIG: Record<JobApplicationStatus, { label: string; color: "success" | "error" | "warning"; icon: typeof CheckCircleOutlineIcon }> = {
  ZUSAGE: { label: "Zusage", color: "success", icon: CheckCircleOutlineIcon },
  ABSAGE: { label: "Absage", color: "error", icon: HighlightOffIcon },
  OFFEN: { label: "Offen", color: "warning", icon: HourglassEmptyIcon },
};

const STATUS_ORDER: JobApplicationStatus[] = ["OFFEN", "ABSAGE", "ZUSAGE"];

type StatusFilter = "ALL" | JobApplicationStatus;

function nextStatus(status: JobApplicationStatus): JobApplicationStatus {
  const idx = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]!;
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

function StatusChip({ status, onToggle }: { status: JobApplicationStatus; onToggle: () => void }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Tooltip title="Status umschalten (Offen / Absage / Zusage)">
      <Chip size="small" color={config.color} icon={<Icon fontSize="small" />} label={config.label} onClick={onToggle} variant="outlined" />
    </Tooltip>
  );
}

interface ApplicationFormValue {
  company: string;
  position: string;
  appliedAt: string;
  location: string;
  interviewNote: string;
  status: JobApplicationStatus;
  notes: string;
}

const EMPTY_FORM: ApplicationFormValue = {
  company: "",
  position: "",
  appliedAt: "",
  location: "",
  interviewNote: "",
  status: "OFFEN",
  notes: "",
};

function toInput(value: ApplicationFormValue): CreateJobApplicationInput {
  return {
    company: value.company.trim(),
    position: value.position.trim() || null,
    appliedAt: value.appliedAt || null,
    location: value.location.trim() || null,
    interviewNote: value.interviewNote.trim() || null,
    status: value.status,
    notes: value.notes.trim() || null,
  };
}

function ApplicationFormFields({ value, onChange }: { value: ApplicationFormValue; onChange: (value: ApplicationFormValue) => void }) {
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Firma"
          placeholder="Firma?"
          required
          fullWidth
          value={value.company}
          onChange={(e) => onChange({ ...value, company: e.target.value })}
        />
        <TextField
          label="Als"
          placeholder="Als welche Stelle?"
          fullWidth
          value={value.position}
          onChange={(e) => onChange({ ...value, position: e.target.value })}
        />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Beworben am"
          type="date"
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
          value={value.appliedAt}
          onChange={(e) => onChange({ ...value, appliedAt: e.target.value })}
        />
        <TextField label="Ort" fullWidth value={value.location} onChange={(e) => onChange({ ...value, location: e.target.value })} />
        <TextField
          select
          label="Status"
          fullWidth
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as JobApplicationStatus })}
        >
          {STATUS_ORDER.map((status) => (
            <MenuItem key={status} value={status}>
              {STATUS_CONFIG[status].label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <TextField
        label="Vorstellungsgespräch"
        placeholder="z.B. Termin/Notiz zum Vorstellungsgespräch"
        fullWidth
        value={value.interviewNote}
        onChange={(e) => onChange({ ...value, interviewNote: e.target.value })}
      />
      <TextField
        label="Zusatz"
        placeholder="Notizen"
        fullWidth
        multiline
        minRows={2}
        value={value.notes}
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
      />
    </Stack>
  );
}

function ApplicationRow({
  application,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  application: JobApplication;
  onToggleStatus: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      sx={{
        alignItems: { sm: "center" },
        justifyContent: "space-between",
        py: 1,
        px: 1.5,
        borderRadius: 1.5,
        "&:hover": { backgroundColor: "action.hover" },
      }}
    >
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {application.company}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {application.position || "—"} · beworben am {formatDate(application.appliedAt)}
          {application.location ? ` · ${application.location}` : ""}
        </Typography>
        {application.interviewNote && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            Vorstellungsgespräch: {application.interviewNote}
          </Typography>
        )}
        {application.notes && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {application.notes}
          </Typography>
        )}
      </Box>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
        <StatusChip status={application.status} onToggle={onToggleStatus} />
        <Tooltip title="Bearbeiten">
          <IconButton size="small" onClick={onEdit}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Löschen">
          <IconButton size="small" onClick={onDelete}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );
}

export function Bewerbungen() {
  const applicationsQuery = useJobApplications();
  const createApplication = useCreateJobApplication();
  const updateApplication = useUpdateJobApplication();
  const deleteApplication = useDeleteJobApplication();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newApplication, setNewApplication] = useState<ApplicationFormValue>(EMPTY_FORM);
  const [editTarget, setEditTarget] = useState<JobApplication | null>(null);
  const [editValue, setEditValue] = useState<ApplicationFormValue>(EMPTY_FORM);

  const all = applicationsQuery.data ?? [];

  const searchQuery = search.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (!searchQuery) return [];
    return all.filter((a) => a.company.toLowerCase().includes(searchQuery) || (a.position ?? "").toLowerCase().includes(searchQuery));
  }, [all, searchQuery]);

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return all;
    return all.filter((a) => a.status === statusFilter);
  }, [all, statusFilter]);

  const total = all.length;
  const absageCount = all.filter((a) => a.status === "ABSAGE").length;
  const zusageCount = all.filter((a) => a.status === "ZUSAGE").length;
  const offenCount = total - absageCount - zusageCount;

  function toggleStatus(application: JobApplication) {
    updateApplication.mutate({ id: application.id, input: { status: nextStatus(application.status) } });
  }

  function handleAdd() {
    if (!newApplication.company.trim()) return;
    createApplication.mutate(toInput(newApplication));
    setNewApplication(EMPTY_FORM);
    setShowAddForm(false);
  }

  function openEdit(application: JobApplication) {
    setEditTarget(application);
    setEditValue({
      company: application.company,
      position: application.position ?? "",
      appliedAt: application.appliedAt ?? "",
      location: application.location ?? "",
      interviewNote: application.interviewNote ?? "",
      status: application.status,
      notes: application.notes ?? "",
    });
  }

  function handleEditSave() {
    if (!editTarget || !editValue.company.trim()) return;
    updateApplication.mutate({ id: editTarget.id, input: toInput(editValue) });
    setEditTarget(null);
  }

  if (applicationsQuery.isLoading) {
    return (
      <PageContainer title="Bewerbungen">
        <LoadingState label="Bewerbungen laden..." />
      </PageContainer>
    );
  }

  if (applicationsQuery.error) {
    return (
      <PageContainer title="Bewerbungen">
        <ErrorState message={getErrorMessage(applicationsQuery.error)} onRetry={() => applicationsQuery.refetch()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Bewerbungen">
      <Card variant="outlined" sx={{ mb: 3, background: "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(16, 185, 129, 0.06))" }}>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", mb: 2 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Avatar sx={{ bgcolor: "background.paper", color: "text.primary" }}>
                <WorkOutlineIcon />
              </Avatar>
              <Box>
                <Typography variant="h6">Habe ich mich dort schon beworben?</Typography>
                <Typography variant="body2" color="text.secondary">
                  {total} Bewerbungen insgesamt · {offenCount} offen · {absageCount} Absagen · {zusageCount} Zusagen
                </Typography>
              </Box>
            </Stack>
          </Stack>

          <TextField
            fullWidth
            size="medium"
            autoFocus
            placeholder="Firma oder Stelle eingeben, bevor du dich bewirbst…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ bgcolor: "background.paper", borderRadius: 1 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
          />

          {searchQuery && (
            <Box sx={{ mt: 2 }}>
              {searchMatches.length === 0 ? (
                <Chip color="success" variant="outlined" label={`Noch keine Bewerbung bei "${search.trim()}" gefunden — du kannst dich bewerben.`} />
              ) : (
                <Stack spacing={1}>
                  <Chip
                    color="warning"
                    variant="outlined"
                    label={`${searchMatches.length} ${searchMatches.length === 1 ? "Treffer" : "Treffer"} gefunden — schon beworben!`}
                  />
                  <Stack divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
                    {searchMatches.map((application) => (
                      <ApplicationRow
                        key={application.id}
                        application={application}
                        onToggleStatus={() => toggleStatus(application)}
                        onEdit={() => openEdit(application)}
                        onDelete={() => {
                          if (window.confirm(`"${application.company}" wirklich löschen?`)) {
                            deleteApplication.mutate(application.id);
                          }
                        }}
                      />
                    ))}
                  </Stack>
                </Stack>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardHeader
          title="Alle Bewerbungen"
          subheader={`${filtered.length} ${filtered.length === 1 ? "Eintrag" : "Einträge"}`}
          slotProps={{ title: { variant: "h6" } }}
          action={
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setShowAddForm((prev) => !prev);
                setNewApplication(EMPTY_FORM);
              }}
            >
              Neue Bewerbung
            </Button>
          }
        />
        <CardContent sx={{ pt: 0 }}>
          <Collapse in={showAddForm}>
            <Box sx={{ mb: 3, p: 2, borderRadius: 1.5, border: "1px solid", borderColor: "divider" }}>
              <ApplicationFormFields value={newApplication} onChange={setNewApplication} />
              <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: "flex-end" }}>
                <Button onClick={() => setShowAddForm(false)}>Abbrechen</Button>
                <Button variant="contained" onClick={handleAdd} disabled={!newApplication.company.trim()}>
                  Speichern
                </Button>
              </Stack>
            </Box>
          </Collapse>

          <Box sx={{ mb: 2 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={statusFilter}
              onChange={(_e, value: StatusFilter | null) => {
                if (value) setStatusFilter(value);
              }}
            >
              <ToggleButton value="ALL">Alle ({total})</ToggleButton>
              <ToggleButton value="OFFEN">Offen ({offenCount})</ToggleButton>
              <ToggleButton value="ABSAGE">Absagen ({absageCount})</ToggleButton>
              <ToggleButton value="ZUSAGE">Zusagen ({zusageCount})</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {filtered.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Keine Bewerbungen in diesem Filter.
            </Typography>
          ) : (
            <Stack divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
              {filtered.map((application) => (
                <ApplicationRow
                  key={application.id}
                  application={application}
                  onToggleStatus={() => toggleStatus(application)}
                  onEdit={() => openEdit(application)}
                  onDelete={() => {
                    if (window.confirm(`"${application.company}" wirklich löschen?`)) {
                      deleteApplication.mutate(application.id);
                    }
                  }}
                />
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Dialog open={editTarget !== null} onClose={() => setEditTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Bewerbung bearbeiten</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <ApplicationFormFields value={editValue} onChange={setEditValue} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>Abbrechen</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={!editValue.company.trim()}>
            Speichern
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
