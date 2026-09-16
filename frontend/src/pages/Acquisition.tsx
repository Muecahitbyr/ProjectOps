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
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import MenuItem from "@mui/material/MenuItem";
import InputAdornment from "@mui/material/InputAdornment";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import LanguageOutlinedIcon from "@mui/icons-material/LanguageOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { OpeningHoursIndicator } from "../components/common/OpeningHoursIndicator";
import { getErrorMessage } from "../utils/getErrorMessage";
import {
  useAcquisitionCompanies,
  useContactAttempts,
  useCreateAcquisitionCompany,
  useCreateContactAttempt,
  useDeleteAcquisitionCompany,
  useUpdateAcquisitionCompany,
} from "../hooks/useAcquisition";
import type { AcquisitionCompany, ContactAttemptOutcome, UpdateAcquisitionCompanyInput } from "../types/acquisition.types";

const OUTCOME_LABELS: Record<ContactAttemptOutcome, string> = {
  NOT_REACHED: "Nicht erreicht",
  SPOKE_TO_STAFF: "Mitarbeiter gesprochen",
  SPOKE_TO_OWNER: "Chef/in gesprochen",
  CALLBACK_REQUESTED: "Rückruf erbeten",
  OTHER: "Sonstiges",
};

// Grobe Heuristik (keine Garantie) fuer typische Erreichbarkeit nach
// Google-Maps-Kategorie (siehe "category" aus "Kunden Finden") - hilft bei
// Nutzerwunsch "Friseure/Restaurants sind waehrend der Geschaeftszeiten
// schwer zu erreichen". Nur ein Hinweis, kein garantiertes Zeitfenster.
const BEST_CONTACT_HINTS: Array<{ match: RegExp; hint: string }> = [
  { match: /friseur|barbier|beauty|nagel|kosmetik/i, hint: "Meist vormittags (vor 11 Uhr) oder direkt nach Ladenschluss ruhiger." },
  { match: /restaurant|café|cafe|bäckerei|backerei|imbiss|pizzeria|gastst/i, hint: "Zwischen den Stoßzeiten (14–17 Uhr) am ehesten erreichbar." },
  { match: /arzt|ärztin|zahnarzt|praxis/i, hint: "Meist über die Praxis-Rezeption - Mittagspause (12–14 Uhr) oft ruhiger." },
  { match: /anwalt|kanzlei|steuerberat/i, hint: "Vormittags meist am ehesten erreichbar, Freitagnachmittag eher nicht." },
  { match: /fitness|studio|sport/i, hint: "Vormittags/früher Nachmittag oft ruhiger als Feierabendzeit." },
  { match: /kfz|autowerkstatt|werkstatt|reifen/i, hint: "Früh morgens (vor 8 Uhr) oder gegen Feierabend eher zu erreichen." },
  { match: /handwerk|maler|elektrik|sanit/i, hint: "Frueh morgens vor Baustellenstart oder abends am ehesten erreichbar." },
];

function getBestContactHint(category: string | null): string | null {
  if (!category) return null;
  return BEST_CONTACT_HINTS.find((entry) => entry.match.test(category))?.hint ?? null;
}

// wa.me erwartet die Nummer ohne Leerzeichen/Klammern/Fuehrende-0, mit
// Landesvorwahl - deutsche Nummern beginnen praktisch immer mit "0", daher
// als Default-Heuristik "0" -> "49" (Deutschland). Keine Garantie fuer
// Nummern aus anderen Laendern.
function toWhatsAppLink(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  const normalized = digits.startsWith("+") ? digits.slice(1) : digits.startsWith("0") ? `49${digits.slice(1)}` : digits;
  const message = encodeURIComponent("Hallo, ich melde mich wegen einer Website für Ihr Unternehmen.");
  return `https://wa.me/${normalized}?text=${message}`;
}

function ContactHistory({ companyId }: { companyId: number }) {
  const attemptsQuery = useContactAttempts(companyId);
  const createAttempt = useCreateContactAttempt(companyId);
  const [outcome, setOutcome] = useState<ContactAttemptOutcome>("NOT_REACHED");
  const [note, setNote] = useState("");

  function handleAdd() {
    createAttempt.mutate({ outcome, ...(note.trim() ? { note: note.trim() } : {}) });
    setNote("");
  }

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField
          select
          size="small"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as ContactAttemptOutcome)}
          sx={{ minWidth: 200 }}
        >
          {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          fullWidth
          placeholder="Notiz (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <Button size="small" variant="outlined" onClick={handleAdd}>
          Protokollieren
        </Button>
      </Stack>

      {attemptsQuery.isLoading && (
        <Typography variant="body2" color="text.secondary">
          Lade Verlauf...
        </Typography>
      )}
      {attemptsQuery.data?.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Noch keine Kontaktversuche protokolliert.
        </Typography>
      )}
      <Stack spacing={0.75}>
        {attemptsQuery.data?.map((attempt) => (
          <Stack key={attempt.id} direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90, flexShrink: 0 }}>
              {new Date(attempt.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {OUTCOME_LABELS[attempt.outcome]}
            </Typography>
            {attempt.note && (
              <Typography variant="body2" color="text.secondary">
                – {attempt.note}
              </Typography>
            )}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

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
  const bestContactHint = getBestContactHint(company.category);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
              {company.name}
            </Typography>
            {company.category && <Chip size="small" variant="outlined" label={company.category} />}
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
            {company.stage === "DONE" && <Chip size="small" color="success" label="Fertig" />}
            <Tooltip title="Loeschen">
              <IconButton size="small" onClick={onDelete}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {(company.phone || company.email || company.websiteUrl || company.address || company.openingHours) && (
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {company.phone && (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <PhoneOutlinedIcon fontSize="inherit" color="action" />
                <Typography variant="body2">{company.phone}</Typography>
                <Tooltip title="WhatsApp-Nachricht schreiben">
                  <IconButton size="small" color="success" component="a" href={toWhatsAppLink(company.phone)} target="_blank" rel="noreferrer">
                    <WhatsAppIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
            {company.email && (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <EmailOutlinedIcon fontSize="inherit" color="action" />
                <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                  {company.email}
                </Typography>
              </Stack>
            )}
            {company.websiteUrl && (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <LanguageOutlinedIcon fontSize="inherit" color="action" />
                <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                  {company.websiteUrl}
                </Typography>
              </Stack>
            )}
            {company.address && (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-start" }}>
                <PlaceOutlinedIcon fontSize="inherit" color="action" sx={{ mt: "2px" }} />
                <Typography variant="body2">{company.address}</Typography>
              </Stack>
            )}
            {company.openingHours ? (
              <OpeningHoursIndicator openingHours={company.openingHours} />
            ) : (
              bestContactHint && (
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                  💡 {bestContactHint}
                </Typography>
              )
            )}
          </Stack>
        )}

        <Stack sx={{ mt: 1.5 }}>
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

        <Accordion sx={{ mt: 1.5, boxShadow: "none", border: "1px solid", borderColor: "divider" }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2">Kontaktverlauf</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <ContactHistory companyId={company.id} />
          </AccordionDetails>
        </Accordion>
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
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const companies = companiesQuery.data ?? [];
    const query = search.trim().toLowerCase();
    const filtered = query ? companies.filter((c) => c.name.toLowerCase().includes(query)) : companies;
    return {
      active: filtered.filter((c) => c.stage !== "NO_WEBSITE"),
      noWebsite: filtered.filter((c) => c.stage === "NO_WEBSITE"),
    };
  }, [companiesQuery.data, search]);

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
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Unternehmensname"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          sx={{ maxWidth: { sm: 320 } }}
        />
        <Button variant="contained" onClick={handleAdd} disabled={!newName.trim()} sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}>
          Hinzufügen
        </Button>
      </Stack>

      <TextField
        size="small"
        placeholder="Firma suchen…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 3, maxWidth: 320 }}
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
