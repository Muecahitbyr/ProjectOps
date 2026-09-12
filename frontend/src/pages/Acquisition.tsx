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
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { getErrorMessage } from "../utils/getErrorMessage";
import {
  useAcquisitionCompanies,
  useCreateAcquisitionCompany,
  useDeleteAcquisitionCompany,
  useUpdateAcquisitionCompany,
} from "../hooks/useAcquisition";
import type { AcquisitionCompany, UpdateAcquisitionCompanyInput } from "../types/acquisition.types";

// Feste Pipeline (Nutzerwunsch, nicht konfigurierbar): 1. Webseite bauen,
// 2. Anrufen, Ja/Nein-Entscheidung "moechte eine Webseite". "Nein" ist ein
// Endzustand (eigene Liste). "Ja" ist KEIN Endzustand - es folgen noch
// 3. Planung, 4. Umsetzung, 5. Live/Fertig, alles weiterhin Teil von
// "In Bearbeitung" (Nutzerwunsch). stage kommt bereits abgeleitet vom
// Backend (siehe acquisition.repository.ts).
function ActiveCompanyCard({
  company,
  onUpdate,
  onDelete,
}: {
  company: AcquisitionCompany;
  onUpdate: (input: UpdateAcquisitionCompanyInput) => void;
  onDelete: () => void;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {company.name}
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            {company.stage === "DONE" && <Chip size="small" color="success" label="Fertig" />}
            <Tooltip title="Loeschen">
              <IconButton size="small" onClick={onDelete}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <Stack sx={{ mt: 1 }}>
          <FormControlLabel
            control={<Checkbox checked={company.websiteBuilt} onChange={(e) => onUpdate({ websiteBuilt: e.target.checked })} />}
            label="1. Webseite bauen"
          />

          {company.websiteBuilt && (
            <FormControlLabel
              control={<Checkbox checked={company.called} onChange={(e) => onUpdate({ called: e.target.checked })} />}
              label="2. Anrufen"
            />
          )}

          {company.called && company.wantsWebsite === null && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Interesse an einer Webseite?
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" color="success" onClick={() => onUpdate({ wantsWebsite: true })}>
                  Ja
                </Button>
                <Button size="small" variant="outlined" color="error" onClick={() => onUpdate({ wantsWebsite: false })}>
                  Nein
                </Button>
              </Stack>
            </Box>
          )}

          {company.wantsWebsite === true && (
            <FormControlLabel
              control={<Checkbox checked={company.websiteSent} onChange={(e) => onUpdate({ websiteSent: e.target.checked })} />}
              label="3. Webseite schicken"
            />
          )}

          {company.websiteSent && company.confirmedAfterViewing === null && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Webseite nach Ansicht gewünscht?
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" color="success" onClick={() => onUpdate({ confirmedAfterViewing: true })}>
                  Ja
                </Button>
                <Button size="small" variant="outlined" color="error" onClick={() => onUpdate({ confirmedAfterViewing: false })}>
                  Nein
                </Button>
              </Stack>
            </Box>
          )}

          {company.confirmedAfterViewing === true && (
            <FormControlLabel
              control={<Checkbox checked={company.planningDone} onChange={(e) => onUpdate({ planningDone: e.target.checked })} />}
              label="4. Planung"
            />
          )}

          {company.planningDone && (
            <FormControlLabel
              control={
                <Checkbox checked={company.implementationDone} onChange={(e) => onUpdate({ implementationDone: e.target.checked })} />
              }
              label="5. Umsetzung"
            />
          )}

          {company.implementationDone && (
            <FormControlLabel
              control={<Checkbox checked={company.live} onChange={(e) => onUpdate({ live: e.target.checked })} />}
              label="6. Live/Fertig"
            />
          )}

          {company.live && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                In KI-Büro hinzufügen?
              </Typography>
              <Button size="small" variant="contained" color="success" onClick={onDelete}>
                Ja
              </Button>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function OutcomeListItem({ company, onUndo, onDelete }: { company: AcquisitionCompany; onUndo: () => void; onDelete: () => void }) {
  return (
    <Stack
      direction="row"
      sx={{ alignItems: "center", justifyContent: "space-between", py: 0.75, px: 1, borderRadius: 1, "&:hover": { backgroundColor: "action.hover" } }}
    >
      <Typography variant="body2">{company.name}</Typography>
      <Stack direction="row" spacing={0.5}>
        <Tooltip title="Zurueck in Bearbeitung">
          <IconButton size="small" onClick={onUndo}>
            <UndoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Loeschen">
          <IconButton size="small" onClick={onDelete}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );
}

export function Acquisition() {
  const companiesQuery = useAcquisitionCompanies();
  const createCompany = useCreateAcquisitionCompany();
  const updateCompany = useUpdateAcquisitionCompany();
  const deleteCompany = useDeleteAcquisitionCompany();

  const [newName, setNewName] = useState("");

  const grouped = useMemo(() => {
    const companies = companiesQuery.data ?? [];
    return {
      active: companies.filter((c) => c.stage !== "NO_WEBSITE"),
      noWebsite: companies.filter((c) => c.stage === "NO_WEBSITE"),
    };
  }, [companiesQuery.data]);

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    createCompany.mutate({ name });
    setNewName("");
  }

  if (companiesQuery.isLoading) {
    return (
      <PageContainer title="Akquise">
        <LoadingState label="Akquise-Pipeline laden..." />
      </PageContainer>
    );
  }

  if (companiesQuery.error) {
    return (
      <PageContainer title="Akquise">
        <ErrorState message={getErrorMessage(companiesQuery.error)} onRetry={() => companiesQuery.refetch()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Akquise">
      <Stack direction="row" spacing={1} sx={{ mb: 3, maxWidth: 480 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Unternehmensname"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <Button variant="contained" onClick={handleAdd} disabled={!newName.trim()}>
          Hinzufügen
        </Button>
      </Stack>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            In Bearbeitung ({grouped.active.length})
          </Typography>
          <Stack spacing={1.5}>
            {grouped.active.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Keine Unternehmen in Bearbeitung.
              </Typography>
            )}
            {grouped.active.map((company) => (
              <ActiveCompanyCard
                key={company.id}
                company={company}
                onUpdate={(input) => updateCompany.mutate({ id: company.id, input })}
                onDelete={() => deleteCompany.mutate(company.id)}
              />
            ))}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card variant="outlined">
            <CardHeader
              title={`Unternehmen die keine Webseite möchten (${grouped.noWebsite.length})`}
              slotProps={{ title: { variant: "h6" } }}
            />
            <CardContent sx={{ pt: 0 }}>
              {grouped.noWebsite.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Noch keine Eintraege.
                </Typography>
              )}
              <Stack>
                {grouped.noWebsite.map((company) => (
                  <OutcomeListItem
                    key={company.id}
                    company={company}
                    onUndo={() =>
                      updateCompany.mutate({
                        id: company.id,
                        // NO_WEBSITE kann von zwei verschiedenen Ja/Nein-Entscheidungen
                        // kommen (siehe AcquisitionStage) - die richtige zuruecksetzen,
                        // sonst wuerden bei einem "Nein" nach Webseiten-Ansicht faelschlich
                        // auch schon erledigte fruehere Schritte (Webseite schicken) mit
                        // zurueckgesetzt.
                        input: company.wantsWebsite === false ? { wantsWebsite: null } : { confirmedAfterViewing: null },
                      })
                    }
                    onDelete={() => deleteCompany.mutate(company.id)}
                  />
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </PageContainer>
  );
}
