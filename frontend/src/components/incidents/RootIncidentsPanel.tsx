import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { useRootIncidents } from "../../hooks/useRootIncidents";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";

// Auftragspunkt 7 "Incident Correlation" - zeigt regelbasiert gruppierte
// Root Incidents (gleiche Fehlerquelle, mehrere Projekte, gleiches
// Zeitfenster, siehe incidents/incident-correlation.ts im Backend). Wird
// nur gerendert, wenn es tatsaechlich korrelierte Incidents gibt - kein
// leerer Abschnitt auf einer ansonsten unbetroffenen Incidents-Seite.
export function RootIncidentsPanel() {
  const query = useRootIncidents();

  if (query.isLoading) {
    return <LoadingState label="Checking for correlated incidents..." minHeight={80} />;
  }
  if (query.isError) {
    return <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={80} />;
  }
  if (!query.data || query.data.length === 0) {
    return null;
  }

  return (
    <Stack sx={{ gap: 2, mb: 3 }}>
      {query.data.map((root) => (
        <Card key={root.id} sx={{ borderLeft: "3px solid", borderColor: healthStatusColors.critical }}>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
              <Box>
                <Typography variant="h4">{root.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Started {formatDateTime(root.startedAt)} · {root.affectedProjectIds.length} projects affected
                </Typography>
              </Box>
              <Chip
                size="small"
                label={root.resolvedAt ? "Resolved" : "Active"}
                sx={{
                  backgroundColor: root.resolvedAt ? undefined : `${healthStatusColors.critical}1f`,
                  color: root.resolvedAt ? undefined : healthStatusColors.critical,
                }}
              />
            </Stack>
            <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap", mt: 1.5 }}>
              {root.incidents.map((incident) => (
                <Chip key={incident.id} size="small" variant="outlined" label={incident.title} />
              ))}
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
