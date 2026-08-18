import { useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TablePagination from "@mui/material/TablePagination";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { ExportMenu } from "./ExportMenu";
import { AnalyticsFilterBar, type AnalyticsFilterValue } from "./AnalyticsFilterBar";
import { useDrillDown } from "../../hooks/useAnalytics";
import { useProjectsHealth } from "../../hooks/useProjects";
import { formatDateTime, formatResponseTime } from "../../utils/formatters";
import { healthStatusColors, severityColors } from "../../theme/statusColors";
import type { DrillDownFilters, DrillDownRow } from "../../types/analytics.types";
import type { ExportColumn } from "../../utils/export";

interface DrillDownDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  filters: DrillDownFilters;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const EXPORT_COLUMNS: ExportColumn<DrillDownRow>[] = [
  { key: "timestamp", label: "Timestamp" },
  { key: "projectName", label: "Project" },
  { key: "checkId", label: "Check" },
  { key: "checkType", label: "Check Type" },
  { key: "status", label: "Status" },
  { key: "responseTimeMs", label: "Response Time (ms)" },
  { key: "health", label: "Health" },
  { key: "incidentId", label: "Incident" },
  { key: "incidentSeverity", label: "Severity" },
];

// Jedes Diagramm auf den Analytics-Seiten oeffnet diesen Dialog mit
// passenden vorbelegten Filtern (Projekt/Zeitraum/Status/...) - liefert die
// rohen check_results/incidents-Zeilen hinter einem Aggregat-Wert, siehe
// "Drill Down" im Auftrag. Der Zeitraum (from/to) aus dem ausloesenden Klick
// bleibt fix (das ist der Sinn des Drill-Downs - genau dieser Ausschnitt),
// Projekt/Status/Severity/Check-Typ/Suche lassen sich im Dialog per
// AnalyticsFilterBar zusaetzlich verfeinern (Mehrfachfilter, siehe
// Auftragspunkt 8).
export function DrillDownDialog({ open, onClose, title, filters }: DrillDownDialogProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [extraFilters, setExtraFilters] = useState<AnalyticsFilterValue>({});
  const projectsQuery = useProjectsHealth();

  // Beim Oeffnen mit den vom Chart vorgegebenen Filtern initialisieren (z.B.
  // Projekt aus einem Verlaufs-Chart) - der Nutzer kann sie danach im Dialog
  // veraendern/erweitern, ohne dass ein erneuter Chart-Klick noetig ist.
  useEffect(() => {
    if (open) {
      setExtraFilters({
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.severity ? { severity: filters.severity } : {}),
        ...(filters.checkType ? { checkType: filters.checkType } : {}),
        ...(filters.search ? { search: filters.search } : {}),
      });
      setPage(0);
    }
  }, [open, filters.projectId, filters.status, filters.severity, filters.checkType, filters.search]);

  const effectiveFilters: DrillDownFilters = {
    ...extraFilters,
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
  };
  const query = useDrillDown({ ...effectiveFilters, page, pageSize });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h4">{title}</Typography>
          <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
            <ExportMenu
              data={query.data?.items ?? []}
              columns={EXPORT_COLUMNS}
              filename="drilldown"
              title={title}
              disabled={!query.data || query.data.items.length === 0}
            />
            <IconButton size="small" onClick={onClose} aria-label="Close">
              <CloseOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack sx={{ mb: 2 }}>
          <AnalyticsFilterBar
            value={extraFilters}
            onChange={(next) => {
              setExtraFilters(next);
              setPage(0);
            }}
            projects={projectsQuery.data ?? []}
          />
        </Stack>
        {query.isLoading ? (
          <LoadingState label="Loading raw data..." minHeight={240} />
        ) : query.isError ? (
          <ErrorState message="Failed to load drill-down data." onRetry={() => query.refetch()} minHeight={240} />
        ) : !query.data || query.data.items.length === 0 ? (
          <EmptyState message="No raw data for this selection." minHeight={240} />
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Timestamp</TableCell>
                    <TableCell>Project</TableCell>
                    <TableCell>Check</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Response Time</TableCell>
                    <TableCell>Health</TableCell>
                    <TableCell>Incident</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {query.data.items.map((row, index) => (
                    <TableRow key={`${row.checkId}-${row.timestamp}-${index}`}>
                      <TableCell>
                        <Typography variant="body2">{formatDateTime(row.timestamp)}</Typography>
                      </TableCell>
                      <TableCell>{row.projectName}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{row.checkId}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.checkType}
                        </Typography>
                      </TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell align="right">{formatResponseTime(row.responseTimeMs)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.health}
                          sx={{ backgroundColor: `${healthStatusColors[row.health]}1f`, color: healthStatusColors[row.health] }}
                        />
                      </TableCell>
                      <TableCell>
                        {row.incidentSeverity ? (
                          <Chip
                            size="small"
                            label={row.incidentSeverity}
                            sx={{
                              backgroundColor: `${severityColors[row.incidentSeverity]}1f`,
                              color: severityColors[row.incidentSeverity],
                            }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={query.data.total}
              page={page}
              onPageChange={(_event, newPage) => setPage(newPage)}
              rowsPerPage={pageSize}
              onRowsPerPageChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
              rowsPerPageOptions={PAGE_SIZE_OPTIONS}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
