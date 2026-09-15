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
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import SearchIcon from "@mui/icons-material/Search";
import FavoriteIcon from "@mui/icons-material/Favorite";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { getErrorMessage } from "../utils/getErrorMessage";
import { useCreateNisanGuest, useDeleteNisanGuest, useNisanGuests, useUpdateNisanGuest } from "../hooks/useNisan";
import type { NisanGuest, NisanGuestStatus, NisanHost } from "../types/nisan.types";

// Zwei feste Listen (Nutzerwunsch, nicht konfigurierbar) fuer die
// Gaesteliste zur Verlobung - je ein Kartenset mit eigener Akzentfarbe.
const HOST_CONFIG: Record<NisanHost, { label: string; color: string; softBg: string }> = {
  MUECAHIT: { label: "Mücahit", color: "#3b82f6", softBg: "rgba(59, 130, 246, 0.08)" },
  GOENUEL: { label: "Gönül", color: "#ec4899", softBg: "rgba(236, 72, 153, 0.08)" },
};

// CONFIRMED = "unbedingt/fix dabei", MAYBE = nur eingeladen, Zusage offen.
const STATUS_CONFIG: Record<NisanGuestStatus, { label: string; color: "success" | "warning"; icon: typeof CheckCircleOutlineIcon }> = {
  CONFIRMED: { label: "Fix dabei", color: "success", icon: CheckCircleOutlineIcon },
  MAYBE: { label: "Eingeladen", color: "warning", icon: HelpOutlineIcon },
};

type StatusFilter = "ALL" | NisanGuestStatus;

function StatusChip({ status, onToggle }: { status: NisanGuestStatus; onToggle: () => void }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Tooltip title="Status umschalten (fix / eingeladen)">
      <Chip size="small" color={config.color} icon={<Icon fontSize="small" />} label={config.label} onClick={onToggle} variant="outlined" />
    </Tooltip>
  );
}

function GuestRow({ guest, onDelete, onToggleStatus }: { guest: NisanGuest; onDelete: () => void; onToggleStatus: () => void }) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: "center",
        justifyContent: "space-between",
        py: 0.75,
        px: 1,
        borderRadius: 1.5,
        gap: 1,
        "&:hover": { backgroundColor: "action.hover" },
      }}
    >
      <Typography variant="body2" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
        {guest.name}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
        <StatusChip status={guest.status} onToggle={onToggleStatus} />
        <Tooltip title="Löschen">
          <IconButton size="small" onClick={onDelete}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );
}

function GuestListCard({
  host,
  guests,
  onAdd,
  onDelete,
  onToggleStatus,
}: {
  host: NisanHost;
  guests: NisanGuest[];
  onAdd: (name: string) => void;
  onDelete: (id: number) => void;
  onToggleStatus: (guest: NisanGuest) => void;
}) {
  const [newName, setNewName] = useState("");
  const config = HOST_CONFIG[host];
  const confirmedCount = guests.filter((g) => g.status === "CONFIRMED").length;
  const maybeCount = guests.length - confirmedCount;

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    onAdd(name);
    setNewName("");
  }

  return (
    <Card variant="outlined" sx={{ height: "100%", borderTop: `3px solid ${config.color}` }}>
      <CardHeader
        avatar={
          <Avatar sx={{ bgcolor: config.softBg, color: config.color, width: 32, height: 32 }}>
            <FavoriteIcon fontSize="small" />
          </Avatar>
        }
        title={`${config.label}s Gäste`}
        subheader={`${guests.length} ${guests.length === 1 ? "Gast" : "Gäste"} · ${confirmedCount} fix · ${maybeCount} eingeladen`}
        slotProps={{ title: { variant: "h6" } }}
      />
      <CardContent sx={{ pt: 0 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Name eingeben"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <Button variant="contained" sx={{ bgcolor: config.color, "&:hover": { bgcolor: config.color } }} onClick={handleAdd} disabled={!newName.trim()}>
            Hinzufügen
          </Button>
        </Stack>

        {guests.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Keine Gäste in diesem Filter.
          </Typography>
        )}
        <Stack divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
          {guests.map((guest) => (
            <GuestRow key={guest.id} guest={guest} onDelete={() => onDelete(guest.id)} onToggleStatus={() => onToggleStatus(guest)} />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function Nisan() {
  const guestsQuery = useNisanGuests();
  const createGuest = useCreateNisanGuest();
  const updateGuest = useUpdateNisanGuest();
  const deleteGuest = useDeleteNisanGuest();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  function toggleStatus(guest: NisanGuest) {
    updateGuest.mutate({ id: guest.id, input: { status: guest.status === "CONFIRMED" ? "MAYBE" : "CONFIRMED" } });
  }

  const allGuests = guestsQuery.data ?? [];

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return allGuests;
    return allGuests.filter((g) => g.status === statusFilter);
  }, [allGuests, statusFilter]);

  const grouped = useMemo(() => {
    return {
      MUECAHIT: filtered.filter((g) => g.host === "MUECAHIT"),
      GOENUEL: filtered.filter((g) => g.host === "GOENUEL"),
    };
  }, [filtered]);

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return filtered.filter((g) => g.name.toLowerCase().includes(query));
  }, [filtered, search]);

  const total = allGuests.length;
  const confirmedTotal = allGuests.filter((g) => g.status === "CONFIRMED").length;
  const maybeTotal = total - confirmedTotal;

  if (guestsQuery.isLoading) {
    return (
      <PageContainer title="Nisan">
        <LoadingState label="Gästeliste laden..." />
      </PageContainer>
    );
  }

  if (guestsQuery.error) {
    return (
      <PageContainer title="Nisan">
        <ErrorState message={getErrorMessage(guestsQuery.error)} onRetry={() => guestsQuery.refetch()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Nisan">
      <Card
        variant="outlined"
        sx={{
          mb: 3,
          background: "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(236, 72, 153, 0.08))",
        }}
      >
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Avatar sx={{ bgcolor: "background.paper", color: "text.primary" }}>
                <GroupsOutlinedIcon />
              </Avatar>
              <Box>
                <Typography variant="h6">Gästeliste zur Verlobung</Typography>
                <Typography variant="body2" color="text.secondary">
                  {total} {total === 1 ? "Gast" : "Gäste"} insgesamt · {confirmedTotal} fix dabei · {maybeTotal} eingeladen · {allGuests.filter((g) => g.host === "MUECAHIT").length} von Mücahit · {allGuests.filter((g) => g.host === "GOENUEL").length} von Gönül
                </Typography>
              </Box>
            </Stack>
            <TextField
              size="small"
              placeholder="Gast suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: { xs: "100%", sm: 260 }, bgcolor: "background.paper", borderRadius: 1 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Stack>

          <Box sx={{ mt: 2 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={statusFilter}
              onChange={(_e, value: StatusFilter | null) => {
                if (value) setStatusFilter(value);
              }}
              sx={{ bgcolor: "background.paper" }}
            >
              <ToggleButton value="ALL">Alle ({total})</ToggleButton>
              <ToggleButton value="CONFIRMED">Fix dabei ({confirmedTotal})</ToggleButton>
              <ToggleButton value="MAYBE">Eingeladen ({maybeTotal})</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {search.trim() && (
            <Box sx={{ mt: 2 }}>
              {searchResults.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Kein Gast gefunden.
                </Typography>
              ) : (
                <Stack spacing={0.5}>
                  {searchResults.map((guest) => (
                    <Stack key={guest.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          bgcolor: HOST_CONFIG[guest.host].color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body2" sx={{ flexGrow: 1 }}>
                        <strong>{guest.name}</strong> — eingeladen von {HOST_CONFIG[guest.host].label}
                      </Typography>
                      <StatusChip status={guest.status} onToggle={() => toggleStatus(guest)} />
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <GuestListCard
            host="MUECAHIT"
            guests={grouped.MUECAHIT}
            onAdd={(name) => createGuest.mutate({ host: "MUECAHIT", name })}
            onDelete={(id) => deleteGuest.mutate(id)}
            onToggleStatus={toggleStatus}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <GuestListCard
            host="GOENUEL"
            guests={grouped.GOENUEL}
            onAdd={(name) => createGuest.mutate({ host: "GOENUEL", name })}
            onDelete={(id) => deleteGuest.mutate(id)}
            onToggleStatus={toggleStatus}
          />
        </Grid>
      </Grid>
    </PageContainer>
  );
}
