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
import Chip from "@mui/material/Chip";
import { StatsCard } from "../dashboard/StatsCard";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useOrganizations } from "../../hooks/useOrganizations";
import { usePlatformUsage } from "../../hooks/usePlatform";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";

// Phase 16 Auftragspunkt 17 "Frontend / Platform Administration" - "Usage
// soll mindestens anzeigen: Requests Today/24h/7d, Error Rate, Average
// Response Time, Quota Usage, Top API Keys, Top Endpoints" - alle Werte
// stammen aus der echten Aggregation in db/api-key-usage.repository.ts
// (Backend), keine Schaetzung/Simulation.
export function UsageTab() {
  const [organizationId, setOrganizationId] = useState("");
  const organizationsQuery = useOrganizations();
  const usageQuery = usePlatformUsage(organizationId || undefined);

  return (
    <Stack sx={{ gap: 3 }}>
      <TextField
        select
        label="Organization"
        size="small"
        value={organizationId}
        onChange={(event) => setOrganizationId(event.target.value)}
        sx={{ minWidth: 240 }}
      >
        <MenuItem value="">All organizations</MenuItem>
        {(organizationsQuery.data ?? []).map((org) => (
          <MenuItem key={org.id} value={org.id}>
            {org.name}
          </MenuItem>
        ))}
      </TextField>

      {usageQuery.isLoading ? (
        <LoadingState label="Loading usage..." minHeight={200} />
      ) : usageQuery.isError || !usageQuery.data ? (
        <ErrorState message={getErrorMessage(usageQuery.error)} onRetry={() => usageQuery.refetch()} minHeight={200} />
      ) : (
        <UsageContent usage={usageQuery.data} />
      )}
    </Stack>
  );
}

function UsageContent({ usage }: { usage: NonNullable<ReturnType<typeof usePlatformUsage>["data"]> }) {
  return (
    <Stack sx={{ gap: 3 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard label="Requests Today" value={usage.requestsToday} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard label="Requests / 24h" value={usage.requestsLast24h} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard label="Requests / 7d" value={usage.requestsLast7d} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard
            label="Error Rate"
            value={`${usage.errorRatePercent}%`}
            accentColor={usage.errorRatePercent > 5 ? healthStatusColors.critical : undefined}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <StatsCard label="Avg Response Time" value={usage.averageResponseTimeMs === null ? "n/a" : `${usage.averageResponseTimeMs}ms`} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 4 }}>
          <StatsCard label="Total API Requests (all-time)" value={usage.totalApiUsageCount} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <StatsCard label="Active API Keys" value={usage.apiKeyCount} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <StatsCard label="Active Service Accounts" value={usage.serviceAccountCount} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <StatsCard label="Pending Webhook Deliveries" value={usage.pendingWebhookDeliveries} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <StatsCard
            label="Dead Letter Deliveries"
            value={usage.deadLetterWebhookDeliveries}
            accentColor={usage.deadLetterWebhookDeliveries > 0 ? healthStatusColors.critical : undefined}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1 }}>
                Top API Keys
              </Typography>
              {usage.topApiKeys.length === 0 ? (
                <EmptyState message="No usage recorded yet." minHeight={100} />
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Key</TableCell>
                      <TableCell align="right">Requests</TableCell>
                      <TableCell align="right">Errors</TableCell>
                      <TableCell>Last used</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {usage.topApiKeys.map((key) => (
                      <TableRow key={key.apiKeyId}>
                        <TableCell>{key.description}</TableCell>
                        <TableCell align="right">{key.requestCount}</TableCell>
                        <TableCell align="right">{key.errorCount}</TableCell>
                        <TableCell>{formatDateTime(key.lastUsedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1 }}>
                Top Endpoints
              </Typography>
              {usage.topEndpoints.length === 0 ? (
                <EmptyState message="No usage recorded yet." minHeight={100} />
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
                    {usage.topEndpoints.map((endpoint) => (
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
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Status Code Distribution
          </Typography>
          {usage.statusCodeDistribution.length === 0 ? (
            <EmptyState message="No usage recorded yet." minHeight={80} />
          ) : (
            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
              {usage.statusCodeDistribution.map((bucket) => (
                <Chip
                  key={bucket.statusCode}
                  label={`${bucket.statusCode}: ${bucket.count}`}
                  sx={{
                    backgroundColor: `${bucket.statusCode >= 400 ? healthStatusColors.critical : healthStatusColors.healthy}1f`,
                    color: bucket.statusCode >= 400 ? healthStatusColors.critical : healthStatusColors.healthy,
                  }}
                />
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
