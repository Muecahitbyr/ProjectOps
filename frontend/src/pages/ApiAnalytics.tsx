import { useState } from "react";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { StatsCard } from "../components/dashboard/StatsCard";
import { ApiUsageTimeseriesChart } from "../components/platform/ApiUsageTimeseriesChart";
import { useOrganizations } from "../hooks/useOrganizations";
import { useApiAnalyticsOverview, useApiAnalyticsTimeseries } from "../hooks/usePlatform";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime } from "../utils/formatters";
import { healthStatusColors } from "../theme/statusColors";
import type { ApiUsageGranularity } from "../types/api-usage.types";

// Phase 19 "Enterprise Observability, API Analytics & Operational
// Intelligence" Auftragspunkt 4 "Frontend" - eigene Seite (nicht Teil der
// Tab-Sammlung in PlatformAdministration.tsx, wie im Auftrag explizit
// unter einem eigenen Pfad "/platform/api-analytics" verlangt), aber
// dieselbe Platform-Owner-only-Absicherung (Backend: authorizePlatformOwner
// auf /api/platform/api-analytics/*) und dasselbe Organisations-
// Filter-/Karten-/Tabellen-Muster wie die bestehende UsageTab.tsx.
export function ApiAnalytics() {
  const [organizationId, setOrganizationId] = useState("");
  const [hours, setHours] = useState(24);
  const [granularity, setGranularity] = useState<ApiUsageGranularity>("hour");

  const organizationsQuery = useOrganizations();
  const overviewQuery = useApiAnalyticsOverview(organizationId || undefined);
  const timeseriesQuery = useApiAnalyticsTimeseries(organizationId || undefined, hours, granularity);

  return (
    <PageContainer title="API Analytics">
      <Stack sx={{ gap: 3 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
          <TextField select label="Organization" size="small" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} sx={{ minWidth: 240 }}>
            <MenuItem value="">All organizations</MenuItem>
            {(organizationsQuery.data ?? []).map((org) => (
              <MenuItem key={org.id} value={org.id}>
                {org.name}
              </MenuItem>
            ))}
          </TextField>

          <Stack direction="row" sx={{ gap: 2, alignItems: "center" }}>
            <TextField
              select
              label="Range"
              size="small"
              value={hours}
              onChange={(event) => {
                const nextHours = Number(event.target.value);
                setHours(nextHours);
                setGranularity(nextHours > 72 ? "day" : "hour");
              }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value={6}>Last 6 hours</MenuItem>
              <MenuItem value={24}>Last 24 hours</MenuItem>
              <MenuItem value={24 * 7}>Last 7 days</MenuItem>
              <MenuItem value={24 * 30}>Last 30 days</MenuItem>
            </TextField>
            <ToggleButtonGroup size="small" value={granularity} exclusive onChange={(_event, value) => value && setGranularity(value)}>
              <ToggleButton value="hour">Hourly</ToggleButton>
              <ToggleButton value="day">Daily</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Stack>

        {overviewQuery.isLoading ? (
          <LoadingState label="Loading API analytics..." minHeight={200} />
        ) : overviewQuery.isError || !overviewQuery.data ? (
          <ErrorState message={getErrorMessage(overviewQuery.error)} onRetry={() => overviewQuery.refetch()} minHeight={200} />
        ) : (
          <>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatsCard label="Requests Today" value={overviewQuery.data.requestsToday} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatsCard
                  label="Error Rate"
                  value={`${overviewQuery.data.errorRatePercent}%`}
                  accentColor={overviewQuery.data.errorRatePercent > 5 ? healthStatusColors.critical : undefined}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatsCard
                  label="Avg Response Time"
                  value={overviewQuery.data.averageResponseTimeMs === null ? "n/a" : `${overviewQuery.data.averageResponseTimeMs}ms`}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatsCard label="Active API Keys" value={overviewQuery.data.activeApiKeysCount} />
              </Grid>
            </Grid>

            <Card>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1 }}>
                  Requests &amp; Error Trend
                </Typography>
                {timeseriesQuery.isLoading ? (
                  <LoadingState label="Loading trend..." minHeight={260} />
                ) : timeseriesQuery.isError || !timeseriesQuery.data ? (
                  <ErrorState message={getErrorMessage(timeseriesQuery.error)} onRetry={() => timeseriesQuery.refetch()} minHeight={260} />
                ) : (
                  <ApiUsageTimeseriesChart buckets={timeseriesQuery.data} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1 }}>
                  API Key Usage
                </Typography>
                {overviewQuery.data.topApiKeys.length === 0 ? (
                  <EmptyState message="No API key usage recorded yet." minHeight={120} />
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Key Name</TableCell>
                        <TableCell align="right">Requests</TableCell>
                        <TableCell align="right">Errors</TableCell>
                        <TableCell>Last Used</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {overviewQuery.data.topApiKeys.map((key) => (
                        <TableRow key={key.apiKeyId}>
                          <TableCell>{key.description}</TableCell>
                          <TableCell align="right">{key.requestCount}</TableCell>
                          <TableCell align="right" sx={{ color: key.errorCount > 0 ? healthStatusColors.critical : undefined }}>
                            {key.errorCount}
                          </TableCell>
                          <TableCell>{formatDateTime(key.lastUsedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 1 }}>
                  Top Endpoints
                </Typography>
                {overviewQuery.data.topEndpoints.length === 0 ? (
                  <EmptyState message="No usage recorded yet." minHeight={120} />
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Endpoint</TableCell>
                        <TableCell align="right">Requests</TableCell>
                        <TableCell align="right">Errors</TableCell>
                        <TableCell align="right">Avg ms</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {overviewQuery.data.topEndpoints.map((endpoint) => (
                        <TableRow key={`${endpoint.method}-${endpoint.endpoint}`}>
                          <TableCell>
                            {endpoint.method} {endpoint.endpoint}
                          </TableCell>
                          <TableCell align="right">{endpoint.requestCount}</TableCell>
                          <TableCell align="right">{endpoint.errorCount}</TableCell>
                          <TableCell align="right">{endpoint.averageDurationMs ?? "n/a"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </Stack>
    </PageContainer>
  );
}
