import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import CircularProgress from "@mui/material/CircularProgress";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import LanguageOutlinedIcon from "@mui/icons-material/LanguageOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { OpeningHoursIndicator } from "../components/common/OpeningHoursIndicator";
import { getErrorMessage } from "../utils/getErrorMessage";
import {
  useAcceptCustomerFinderResult,
  useCreateCustomerFinderJob,
  useCustomerFinderJobs,
  useCustomerFinderResults,
  useRejectCustomerFinderResult,
} from "../hooks/useCustomerFinder";
import type { CustomerFinderJobStatus, CustomerFinderResult } from "../types/customer-finder.types";

const JOB_STATUS_CONFIG: Record<CustomerFinderJobStatus, { label: string; color: "default" | "info" | "success" | "error" }> = {
  PENDING: { label: "Wird gestartet…", color: "info" },
  WORKING: { label: "Suche läuft…", color: "info" },
  DONE: { label: "Fertig", color: "success" },
  FAILED: { label: "Fehlgeschlagen", color: "error" },
};

// Kartenlayout fuer schmale Bildschirme (Handy) - die 9-spaltige Tabelle
// waere dort auch mit Scrollen unleserlich klein. Ab "md" wird stattdessen
// die vollstaendige Tabelle gezeigt (siehe ResultsTable weiter unten) -
// beide Darstellungen bekommen dieselben Daten, nur CSS (display: none)
// schaltet zwischen ihnen um, kein doppeltes Fetching.
function ResultCard({ result, onAccept, onReject }: { result: CustomerFinderResult; onAccept: () => void; onReject: () => void }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
              {result.name}
            </Typography>
            {result.category && (
              <Typography variant="caption" color="text.secondary">
                {result.category}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
            <Tooltip title="Zu Akquise übernehmen">
              <IconButton size="small" color="success" onClick={onAccept}>
                <CheckOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Verwerfen">
              <IconButton size="small" color="error" onClick={onReject}>
                <CloseOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {result.phone && (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <PhoneOutlinedIcon fontSize="inherit" color="action" />
              <Typography variant="body2">{result.phone}</Typography>
            </Stack>
          )}
          {result.website && (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <LanguageOutlinedIcon fontSize="inherit" color="action" />
              <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                {result.website}
              </Typography>
            </Stack>
          )}
          {result.address && (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-start" }}>
              <PlaceOutlinedIcon fontSize="inherit" color="action" sx={{ mt: "2px" }} />
              <Typography variant="body2">{result.address}</Typography>
            </Stack>
          )}
          {result.openingHours && <OpeningHoursIndicator openingHours={result.openingHours} />}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function CustomerFinder() {
  const jobsQuery = useCustomerFinderJobs();
  const resultsQuery = useCustomerFinderResults();
  const createJob = useCreateCustomerFinderJob();
  const acceptResult = useAcceptCustomerFinderResult();
  const rejectResult = useRejectCustomerFinderResult();

  const [keywords, setKeywords] = useState("");
  const [city, setCity] = useState("");
  const [noWebsite, setNoWebsite] = useState(false);

  const currentJob = useMemo(() => jobsQuery.data?.[0], [jobsQuery.data]);
  const jobRunning = currentJob?.status === "PENDING" || currentJob?.status === "WORKING";

  function handleSearch() {
    if (!keywords.trim() || !city.trim()) return;
    createJob.mutate({
      keywords: keywords.trim(),
      city: city.trim(),
      filterNoWebsite: noWebsite,
    });
  }

  if (resultsQuery.isLoading || jobsQuery.isLoading) {
    return (
      <PageContainer title="Kunden Finden">
        <LoadingState label="Lade..." />
      </PageContainer>
    );
  }

  if (resultsQuery.error) {
    return (
      <PageContainer title="Kunden Finden">
        <ErrorState message={getErrorMessage(resultsQuery.error)} onRetry={() => resultsQuery.refetch()} />
      </PageContainer>
    );
  }

  const results = resultsQuery.data ?? [];

  return (
    <PageContainer title="Kunden Finden">
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardHeader title="Neue Suche" slotProps={{ title: { variant: "h6" } }} />
        <CardContent sx={{ pt: 0 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              size="small"
              fullWidth
              label="Branche / Keywords"
              placeholder="z.B. Friseur"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
            <TextField size="small" fullWidth label="Stadt" placeholder="z.B. Köln" value={city} onChange={(e) => setCity(e.target.value)} />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2, alignItems: { sm: "center" } }}>
            <FormControlLabel
              control={<Checkbox checked={noWebsite} onChange={(e) => setNoWebsite(e.target.checked)} />}
              label="Nur ohne Website"
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
            <Button
              variant="contained"
              onClick={handleSearch}
              disabled={!keywords.trim() || !city.trim() || jobRunning}
              sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
            >
              Suchen
            </Button>
            {currentJob && (
              <Chip
                size="small"
                color={JOB_STATUS_CONFIG[currentJob.status].color}
                icon={jobRunning ? <CircularProgress size={14} color="inherit" /> : undefined}
                label={
                  currentJob.status === "DONE"
                    ? `Fertig: ${currentJob.resultCount} Ergebnis${currentJob.resultCount === 1 ? "" : "se"}`
                    : currentJob.status === "FAILED"
                      ? `Fehlgeschlagen${currentJob.errorMessage ? `: ${currentJob.errorMessage}` : ""}`
                      : JOB_STATUS_CONFIG[currentJob.status].label
                }
                sx={{ maxWidth: "100%", height: "auto", "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 } }}
              />
            )}
          </Stack>
          {createJob.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              Suche konnte nicht gestartet werden: {getErrorMessage(createJob.error)}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardHeader title={`Ergebnisse (${results.length})`} slotProps={{ title: { variant: "h6" } }} />
        <CardContent sx={{ pt: 0 }}>
          {results.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Noch keine Ergebnisse. Starte oben eine Suche.
            </Typography>
          ) : (
            <>
              {/* Handy/Tablet: Kartenliste statt breiter Tabelle. */}
              <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
                {results.map((result) => (
                  <ResultCard
                    key={result.id}
                    result={result}
                    onAccept={() => acceptResult.mutate(result.id)}
                    onReject={() => rejectResult.mutate(result.id)}
                  />
                ))}
              </Stack>

              {/* Ab "md": volle Tabelle. */}
              <Box sx={{ display: { xs: "none", md: "block" }, overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Telefon</TableCell>
                      <TableCell>Website</TableCell>
                      <TableCell>Kategorie</TableCell>
                      <TableCell>Adresse</TableCell>
                      <TableCell>Öffnungszeiten</TableCell>
                      <TableCell align="right">Aktionen</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results.map((result) => (
                      <TableRow key={result.id} hover>
                        <TableCell>{result.name}</TableCell>
                        <TableCell>{result.phone ?? "–"}</TableCell>
                        <TableCell>{result.website ?? "–"}</TableCell>
                        <TableCell>{result.category ?? "–"}</TableCell>
                        <TableCell>{result.address ?? "–"}</TableCell>
                        <TableCell>{result.openingHours ? <OpeningHoursIndicator openingHours={result.openingHours} /> : "–"}</TableCell>
                        <TableCell align="right">
                          <Tooltip title="Zu Akquise übernehmen">
                            <IconButton size="small" color="success" onClick={() => acceptResult.mutate(result.id)}>
                              <CheckOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Verwerfen">
                            <IconButton size="small" color="error" onClick={() => rejectResult.mutate(result.id)}>
                              <CloseOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
