import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { HistoryMetricChart } from "./HistoryMetricChart";
import { useProjectComparison } from "../../hooks/useAnalytics";
import { formatDuration, formatPercent, formatResponseTime } from "../../utils/formatters";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { healthStatusColors } from "../../theme/statusColors";
import type { ProjectComparisonSide } from "../../types/analytics.types";

interface ProjectComparisonPanelProps {
  projectAId: string;
  projectBId: string;
  hours: number;
}

interface MetricRow {
  label: string;
  format: (side: ProjectComparisonSide) => string;
}

const METRIC_ROWS: MetricRow[] = [
  { label: "Health Score", format: (side) => String(side.healthScore) },
  { label: "Availability", format: (side) => formatPercent(side.availabilityPercent) },
  { label: "Avg Response Time", format: (side) => formatResponseTime(side.avgResponseTimeMs) },
  { label: "Total Incidents", format: (side) => String(side.incidents.total) },
  { label: "Open Incidents", format: (side) => String(side.incidents.open) },
  { label: "Total Downtime", format: (side) => formatDuration(side.totalDowntimeMs) },
  { label: "Recovery Time (MTTR)", format: (side) => formatDuration(side.mttrMs) },
  { label: "SLA", format: (side) => formatPercent(side.slaPercent) },
];

// Auftragspunkt 6 ("Projektvergleich") - beliebige zwei Projekte
// nebeneinander, inkl. Verlaufscharts. Die eigentliche Berechnung stammt
// vollstaendig aus getProjectComparison() (analytics.repository.ts), das
// bestehende Funktionen (getProjectHealth/getProjectSla/getProjectHistory)
// fuer beide Projekte wiederverwendet statt eigene Formeln zu duplizieren.
export function ProjectComparisonPanel({ projectAId, projectBId, hours }: ProjectComparisonPanelProps) {
  const query = useProjectComparison(projectAId, projectBId, hours);

  if (projectAId === projectBId) {
    return <ErrorState message="Please select two different projects." minHeight={200} />;
  }
  if (query.isLoading) {
    return <LoadingState label="Loading comparison..." minHeight={300} />;
  }
  if (query.isError || !query.data) {
    return <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={300} />;
  }

  const { a, b } = query.data;

  return (
    <Stack sx={{ gap: 3 }}>
      <Card>
        <CardContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Metric</TableCell>
                <TableCell align="right">{a.projectName}</TableCell>
                <TableCell align="right">{b.projectName}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {METRIC_ROWS.map((row) => (
                <TableRow key={row.label}>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {row.label}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{row.format(a)}</TableCell>
                  <TableCell align="right">{row.format(b)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {[a, b].map((side) => (
          <Grid key={side.projectId} size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1 }}>
                  {side.projectName} · Health Score
                </Typography>
                <HistoryMetricChart buckets={side.history.buckets} metricKey="healthScore" color={healthStatusColors.healthy} height={200} />
              </CardContent>
            </Card>
          </Grid>
        ))}
        {[a, b].map((side) => (
          <Grid key={`${side.projectId}-response`} size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1 }}>
                  {side.projectName} · Response Time
                </Typography>
                <HistoryMetricChart buckets={side.history.buckets} metricKey="avgResponseTimeMs" color="#3b82f6" unit="ms" height={200} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}
