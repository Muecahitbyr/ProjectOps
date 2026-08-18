import { useState } from "react";
import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { ForecastChart } from "./ForecastChart";
import { useRegionAnalytics, useAgentPerformance, useAgentHeartbeatTimeline, useMaintenanceImpact } from "../../hooks/useRegionAnalytics";
import { useMonitoringAgents } from "../../hooks/useMonitoringAgents";
import { useForecast } from "../../hooks/useForecast";
import { useClusterAnalytics } from "../../hooks/useCluster";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime, formatDuration, formatPercent, formatResponseTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import type { ForecastMetric } from "../../types/forecast.types";

const FORECAST_METRIC_OPTIONS: Array<{ value: ForecastMetric; label: string }> = [
  { value: "INCIDENT_COUNT", label: "Incident Forecast" },
  { value: "FAILURE_RATE", label: "Failure Trend" },
  { value: "RESPONSE_TIME", label: "Response Time Trend" },
  { value: "HEALTH_SCORE", label: "Health Trend" },
  { value: "DISK_USAGE", label: "Disk Growth" },
  { value: "CAPACITY", label: "Capacity Forecast" },
];

function failureColor(percent: number): string | undefined {
  if (percent > 20) return healthStatusColors.critical;
  if (percent > 5) return healthStatusColors.warning;
  return undefined;
}

// Phase 13 Teil 14 "Analytics Erweiterung" - Region Comparison, Availability
// (als farbcodierte Vergleichstabelle statt einer Kartenbibliothek - im
// Stack ist noch keine Map-Library vorhanden, ein neues, mehrere hundert KB
// grosses Paket fuer eine einzelne Ansicht waere hier unverhaeltnismaessig),
// Forecast Charts, Maintenance Impact, Agent Performance, Prediction
// Accuracy (R², siehe ForecastChart), Heartbeat Timeline.
export function ObservabilityAnalyticsTab() {
  const theme = useTheme();
  const [hours, setHours] = useState(24 * 30);
  const [forecastMetric, setForecastMetric] = useState<ForecastMetric>("HEALTH_SCORE");
  const [heartbeatAgentId, setHeartbeatAgentId] = useState("");

  const regionsQuery = useRegionAnalytics(hours);
  const agentPerformanceQuery = useAgentPerformance(hours);
  const maintenanceImpactQuery = useMaintenanceImpact(20);
  const forecastQuery = useForecast(forecastMetric);
  const agentsQuery = useMonitoringAgents();
  const heartbeatQuery = useAgentHeartbeatTimeline(heartbeatAgentId || agentsQuery.data?.[0]?.id, 24 * 7);
  const clusterAnalyticsQuery = useClusterAnalytics();

  return (
    <Stack sx={{ gap: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <TextField select label="Period" size="small" value={hours} onChange={(event) => setHours(Number(event.target.value))} sx={{ minWidth: 160 }}>
          <MenuItem value={24}>Last 24h</MenuItem>
          <MenuItem value={24 * 7}>Last 7d</MenuItem>
          <MenuItem value={24 * 30}>Last 30d</MenuItem>
          <MenuItem value={24 * 90}>Last 90d</MenuItem>
        </TextField>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1.5 }}>
                Region Comparison
              </Typography>
              {regionsQuery.isLoading ? (
                <LoadingState label="Loading..." minHeight={120} />
              ) : regionsQuery.isError || !regionsQuery.data ? (
                <ErrorState message={getErrorMessage(regionsQuery.error)} minHeight={120} />
              ) : regionsQuery.data.length === 0 ? (
                <EmptyState message="No check data in this period yet." minHeight={120} />
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Region</TableCell>
                      <TableCell align="right">Agents</TableCell>
                      <TableCell align="right">Avg Response</TableCell>
                      <TableCell align="right">Failure Rate</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {regionsQuery.data.map((entry) => (
                      <TableRow key={entry.region}>
                        <TableCell>{entry.region}</TableCell>
                        <TableCell align="right">{entry.agentCount}</TableCell>
                        <TableCell align="right">{formatResponseTime(entry.avgResponseTimeMs)}</TableCell>
                        <TableCell align="right" sx={{ color: failureColor(entry.failureRatePercent) }}>
                          {formatPercent(entry.failureRatePercent)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1.5 }}>
                Agent Performance
              </Typography>
              {agentPerformanceQuery.isLoading ? (
                <LoadingState label="Loading..." minHeight={120} />
              ) : agentPerformanceQuery.isError || !agentPerformanceQuery.data ? (
                <ErrorState message={getErrorMessage(agentPerformanceQuery.error)} minHeight={120} />
              ) : agentPerformanceQuery.data.length === 0 ? (
                <EmptyState message="No monitoring agents registered." minHeight={120} />
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Agent</TableCell>
                      <TableCell align="right">Checks</TableCell>
                      <TableCell align="right">Avg Response</TableCell>
                      <TableCell align="right">Failure Rate</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {agentPerformanceQuery.data.map((entry) => (
                      <TableRow key={entry.agentId}>
                        <TableCell>{entry.agentName}</TableCell>
                        <TableCell align="right">{entry.checkCount}</TableCell>
                        <TableCell align="right">{formatResponseTime(entry.avgResponseTimeMs)}</TableCell>
                        <TableCell align="right" sx={{ color: failureColor(entry.failureRatePercent) }}>
                          {formatPercent(entry.failureRatePercent)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                <Typography variant="h4">Forecast</Typography>
                <TextField
                  select
                  size="small"
                  value={forecastMetric}
                  onChange={(event) => setForecastMetric(event.target.value as ForecastMetric)}
                  sx={{ minWidth: 200 }}
                >
                  {FORECAST_METRIC_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              {forecastQuery.isLoading ? (
                <LoadingState label="Loading forecast..." minHeight={240} />
              ) : forecastQuery.isError || !forecastQuery.data ? (
                <ErrorState message={getErrorMessage(forecastQuery.error)} minHeight={240} />
              ) : (
                <ForecastChart forecast={forecastQuery.data} />
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                <Typography variant="h4">Heartbeat Timeline (7d)</Typography>
                <TextField
                  select
                  size="small"
                  value={heartbeatAgentId || agentsQuery.data?.[0]?.id || ""}
                  onChange={(event) => setHeartbeatAgentId(event.target.value)}
                  sx={{ minWidth: 160 }}
                >
                  {(agentsQuery.data ?? []).map((agent) => (
                    <MenuItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              {heartbeatQuery.isLoading ? (
                <LoadingState label="Loading..." minHeight={200} />
              ) : heartbeatQuery.isError || !heartbeatQuery.data ? (
                <ErrorState message={getErrorMessage(heartbeatQuery.error)} minHeight={200} />
              ) : heartbeatQuery.data.length === 0 ? (
                <EmptyState message="No heartbeats recorded yet." minHeight={200} />
              ) : (
                <Box sx={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={heartbeatQuery.data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                      <CartesianGrid stroke={theme.palette.divider} vertical={false} />
                      <XAxis
                        dataKey="bucketStart"
                        tickFormatter={(value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        stroke={theme.palette.text.secondary}
                        fontSize={12}
                        minTickGap={40}
                      />
                      <YAxis stroke={theme.palette.text.secondary} fontSize={12} width={40} allowDecimals={false} />
                      <Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString()} />
                      <Bar dataKey="heartbeatCount" name="Heartbeats" fill={theme.palette.primary.main} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1.5 }}>
                Maintenance Impact
              </Typography>
              {maintenanceImpactQuery.isLoading ? (
                <LoadingState label="Loading..." minHeight={120} />
              ) : maintenanceImpactQuery.isError || !maintenanceImpactQuery.data ? (
                <ErrorState message={getErrorMessage(maintenanceImpactQuery.error)} minHeight={120} />
              ) : maintenanceImpactQuery.data.length === 0 ? (
                <EmptyState message="No maintenance windows recorded yet." minHeight={120} />
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Reason</TableCell>
                      <TableCell>Window</TableCell>
                      <TableCell align="right">Issues observed during window</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {maintenanceImpactQuery.data.map((entry) => (
                      <TableRow key={entry.maintenanceWindowId}>
                        <TableCell>{entry.reason}</TableCell>
                        <TableCell>
                          {formatDateTime(entry.startsAt)} → {formatDateTime(entry.endsAt)}
                        </TableCell>
                        <TableCell align="right">{entry.issuesObservedDuringWindow}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Phase 14 Teil 7 "Cluster Analytics" - Check/Load Distribution ueber
            agent_assignments (Phase 14 Distributed Scheduler), Recovery
            Timeline ueber echte FAILOVER_STARTED/FINISHED-Zeitdifferenzen
            (core/failover.ts). Region Comparison/Agent Performance/
            Heartbeat Timeline oben stammen bereits aus Phase 13. */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1.5 }}>
                Cluster Check Distribution
              </Typography>
              {clusterAnalyticsQuery.isLoading ? (
                <LoadingState label="Loading..." minHeight={200} />
              ) : clusterAnalyticsQuery.isError || !clusterAnalyticsQuery.data ? (
                <ErrorState message={getErrorMessage(clusterAnalyticsQuery.error)} minHeight={200} />
              ) : clusterAnalyticsQuery.data.distribution.length === 0 ? (
                <EmptyState message="No agents registered." minHeight={200} />
              ) : (
                <Box sx={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={clusterAnalyticsQuery.data.distribution} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                      <CartesianGrid stroke={theme.palette.divider} vertical={false} />
                      <XAxis dataKey="agentName" stroke={theme.palette.text.secondary} fontSize={12} />
                      <YAxis stroke={theme.palette.text.secondary} fontSize={12} width={40} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="assignedCheckCount" name="Assigned checks" fill={theme.palette.primary.main} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 1.5 }}>
                Failover Recovery Timeline
              </Typography>
              {clusterAnalyticsQuery.isLoading ? (
                <LoadingState label="Loading..." minHeight={200} />
              ) : clusterAnalyticsQuery.isError || !clusterAnalyticsQuery.data ? (
                <ErrorState message={getErrorMessage(clusterAnalyticsQuery.error)} minHeight={200} />
              ) : clusterAnalyticsQuery.data.failoverHistory.length === 0 ? (
                <EmptyState message="No failovers recorded yet." minHeight={200} />
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Agent</TableCell>
                      <TableCell>Started</TableCell>
                      <TableCell align="right">Recovery Time</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {clusterAnalyticsQuery.data.failoverHistory.map((entry) => (
                      <TableRow key={entry.failoverId}>
                        <TableCell>{entry.failedAgentName}</TableCell>
                        <TableCell>{formatDateTime(entry.startedAt)}</TableCell>
                        <TableCell align="right">{formatDuration(entry.recoveryTimeMs)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
