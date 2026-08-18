import { useMemo, useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { RangeSelector, type CustomRangeValue } from "./RangeSelector";
import { HistoryMetricChart } from "./HistoryMetricChart";
import { DrillDownDialog } from "./DrillDownDialog";
import { ExportMenu } from "./ExportMenu";
import { useProjectHistory } from "../../hooks/useAnalytics";
import { healthStatusColors } from "../../theme/statusColors";
import { getErrorMessage } from "../../utils/getErrorMessage";
import type { AnalyticsRange, HistoryBucket } from "../../types/analytics.types";
import type { ExportColumn } from "../../utils/export";

interface ProjectHistoryChartsProps {
  projectId: string;
}

const HISTORY_EXPORT_COLUMNS: ExportColumn<HistoryBucket>[] = [
  { key: "bucketStart", label: "Bucket" },
  { key: "healthScore", label: "Health Score" },
  { key: "avgResponseTimeMs", label: "Avg Response (ms)" },
  { key: "incidentCount", label: "Incidents" },
  { key: "errorRate", label: "Error Rate (%)" },
  { key: "availability", label: "Availability (%)" },
  { key: "sampleCount", label: "Samples" },
];

// Deckt Auftragspunkt 2 ("Historische Diagramme") vollstaendig fuer ein
// Projekt ab: 5 Metriken, gemeinsamer Zeitraum-Umschalter (1h/24h/7d/30d/
// custom), Klick auf einen Datenpunkt oeffnet den Drill-Down-Dialog fuer
// genau dieses Zeit-Bucket.
export function ProjectHistoryCharts({ projectId }: ProjectHistoryChartsProps) {
  const [range, setRange] = useState<AnalyticsRange>("24h");
  const [custom, setCustom] = useState<CustomRangeValue>({ from: "", to: "" });
  const [drillDownBucket, setDrillDownBucket] = useState<HistoryBucket | null>(null);

  const params = useMemo(
    () => (range === "custom" ? { range, from: custom.from, to: custom.to } : { range }),
    [range, custom],
  );
  const historyQuery = useProjectHistory(projectId, params);

  const handleBucketClick = (bucket: HistoryBucket): void => setDrillDownBucket(bucket);

  const buckets = historyQuery.data?.buckets ?? [];
  const bucketMinutes = historyQuery.data?.bucketMinutes ?? 30;

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <RangeSelector range={range} onRangeChange={setRange} custom={custom} onCustomChange={setCustom} />
        <ExportMenu
          data={buckets}
          columns={HISTORY_EXPORT_COLUMNS}
          filename={`${projectId}-history-${range}`}
          title={`${projectId} history (${range})`}
          disabled={historyQuery.isLoading}
        />
      </Stack>

      {historyQuery.isLoading ? (
        <LoadingState label="Loading history..." minHeight={200} />
      ) : historyQuery.isError ? (
        <ErrorState message={getErrorMessage(historyQuery.error)} onRetry={() => historyQuery.refetch()} minHeight={200} />
      ) : (
        <Grid container spacing={2}>
          {[
            { title: "Health Score", metricKey: "healthScore" as const, color: healthStatusColors.healthy, unit: "" },
            { title: "Response Time", metricKey: "avgResponseTimeMs" as const, color: "#3b82f6", unit: "ms" },
            { title: "Incidents", metricKey: "incidentCount" as const, color: healthStatusColors.critical, unit: "", variant: "bar" as const },
            { title: "Error Rate", metricKey: "errorRate" as const, color: healthStatusColors.warning, unit: "%" },
            { title: "Availability", metricKey: "availability" as const, color: "#22c55e", unit: "%" },
          ].map((chart) => (
            <Grid key={chart.metricKey} size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 1 }}>
                    {chart.title}
                  </Typography>
                  <HistoryMetricChart
                    buckets={buckets}
                    metricKey={chart.metricKey}
                    color={chart.color}
                    unit={chart.unit}
                    variant={chart.variant}
                    onBucketClick={handleBucketClick}
                  />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {drillDownBucket ? (
        <DrillDownDialog
          open={drillDownBucket !== null}
          onClose={() => setDrillDownBucket(null)}
          title={`${projectId} · ${new Date(drillDownBucket.bucketStart).toLocaleString()}`}
          filters={{
            projectId,
            from: drillDownBucket.bucketStart,
            to: new Date(new Date(drillDownBucket.bucketStart).getTime() + bucketMinutes * 60 * 1000).toISOString(),
          }}
        />
      ) : null}
    </Stack>
  );
}
