import { useState } from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { usePublicStatusHistory, usePublicStatusPage } from "../hooks/useStatusPage";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime, formatPercent } from "../utils/formatters";
import type { PublicIncidentStatus } from "../types/status-page.types";

const STATUS_META: Record<PublicIncidentStatus, { label: string; color: string }> = {
  operational: { label: "Operational", color: "#22c55e" },
  degraded: { label: "Degraded Performance", color: "#f59e0b" },
  partial_outage: { label: "Partial Outage", color: "#f97316" },
  major_outage: { label: "Major Outage", color: "#ef4444" },
  maintenance: { label: "Under Maintenance", color: "#60a5fa" },
};

const HISTORY_RANGES = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "365d", days: 365 },
];

function StatusHistoryStrip({ projectId }: { projectId: string }) {
  const [days, setDays] = useState(7);
  const historyQuery = usePublicStatusHistory(projectId, days);

  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" sx={{ gap: 1, mb: 1 }}>
        {HISTORY_RANGES.map((range) => (
          <Chip
            key={range.days}
            size="small"
            label={range.label}
            onClick={() => setDays(range.days)}
            variant={days === range.days ? "filled" : "outlined"}
            color={days === range.days ? "primary" : "default"}
          />
        ))}
      </Stack>
      {historyQuery.isLoading ? (
        <LoadingState label="Loading history..." minHeight={40} />
      ) : historyQuery.isError || !historyQuery.data ? (
        <Typography variant="caption" color="text.secondary">
          History unavailable.
        </Typography>
      ) : historyQuery.data.buckets.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No monitoring data yet for this range.
        </Typography>
      ) : (
        <Stack direction="row" sx={{ gap: "2px", height: 32, alignItems: "stretch" }}>
          {historyQuery.data.buckets.map((bucket) => (
            <Tooltip
              key={bucket.bucketStart}
              title={`${formatDateTime(bucket.bucketStart)} — ${STATUS_META[bucket.status].label} (${formatPercent(bucket.uptimePercent)} uptime)`}
            >
              <Box
                sx={{
                  flex: 1,
                  minWidth: 2,
                  borderRadius: 0.5,
                  backgroundColor: STATUS_META[bucket.status].color,
                  opacity: 0.85,
                }}
              />
            </Tooltip>
          ))}
        </Stack>
      )}
    </Box>
  );
}

// Phase 13 Teil 3+4 "Public Status Page" / "Status History" - eigene,
// oeffentliche Seite OHNE Sidebar/Header/Login (siehe App.tsx: als
// Top-Level-Route wie /login gemountet, nicht innerhalb ProtectedRoute).
// Zeigt ausschliesslich die stark reduzierten Public*-Daten aus
// status-page.repository.ts - keine internen/User-/AI-/Automation-Daten.
export function StatusPage() {
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const statusQuery = usePublicStatusPage();

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "background.default", py: 6 }}>
      <Container maxWidth="md">
        <Stack sx={{ gap: 4 }}>
          <Box>
            <Typography variant="h1" sx={{ fontSize: 28, fontWeight: 700 }}>
              ProjectOps Status
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Live availability for all monitored projects.
            </Typography>
          </Box>

          {statusQuery.isLoading ? (
            <LoadingState label="Loading status..." minHeight={300} />
          ) : statusQuery.isError || !statusQuery.data ? (
            <ErrorState message={getErrorMessage(statusQuery.error)} onRetry={() => statusQuery.refetch()} minHeight={300} />
          ) : (
            <>
              <Card sx={{ borderLeft: `4px solid ${STATUS_META[statusQuery.data.overallStatus].color}` }}>
                <CardContent>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
                    {statusQuery.data.overallStatus === "operational" ? (
                      <CheckCircleOutlineIcon sx={{ color: STATUS_META.operational.color }} />
                    ) : (
                      <ReportProblemOutlinedIcon sx={{ color: STATUS_META[statusQuery.data.overallStatus].color }} />
                    )}
                    <Typography variant="h4">{STATUS_META[statusQuery.data.overallStatus].label}</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Last updated {formatDateTime(statusQuery.data.generatedAt)}
                  </Typography>
                </CardContent>
              </Card>

              <Stack sx={{ gap: 2 }}>
                {statusQuery.data.projects.map((project) => (
                  <Card key={project.id}>
                    <CardContent
                      sx={{ cursor: "pointer" }}
                      onClick={() => setExpandedProjectId((current) => (current === project.id ? null : project.id))}
                    >
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                        <Typography variant="h4">{project.name}</Typography>
                        <Chip
                          size="small"
                          label={STATUS_META[project.status].label}
                          sx={{ backgroundColor: `${STATUS_META[project.status].color}1f`, color: STATUS_META[project.status].color }}
                        />
                      </Stack>
                      <Stack direction="row" sx={{ gap: 3, mt: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          24h uptime: {formatPercent(project.uptimePercent24h)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          90d uptime: {formatPercent(project.uptimePercent90d)}
                        </Typography>
                      </Stack>
                      {project.activeMaintenance ? (
                        <Stack direction="row" sx={{ alignItems: "center", gap: 0.75, mt: 1 }}>
                          <BuildOutlinedIcon fontSize="small" sx={{ color: STATUS_META.maintenance.color }} />
                          <Typography variant="body2" color="text.secondary">
                            {project.activeMaintenance.reason} (until {formatDateTime(project.activeMaintenance.endsAt)})
                          </Typography>
                        </Stack>
                      ) : null}
                      {expandedProjectId === project.id ? <StatusHistoryStrip projectId={project.id} /> : null}
                    </CardContent>
                  </Card>
                ))}
              </Stack>

              {statusQuery.data.activeIncidents.length > 0 && (
                <Box>
                  <Typography variant="h4" sx={{ mb: 1.5 }}>
                    Active Incidents
                  </Typography>
                  <Stack sx={{ gap: 1.5 }}>
                    {statusQuery.data.activeIncidents.map((incident, index) => (
                      <Card key={`${incident.projectId}-${incident.startedAt}-${index}`}>
                        <CardContent>
                          <Typography variant="body1">{incident.title}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {incident.projectName} · Since {formatDateTime(incident.startedAt)}
                          </Typography>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                </Box>
              )}

              {statusQuery.data.upcomingMaintenance.length > 0 && (
                <Box>
                  <Typography variant="h4" sx={{ mb: 1.5 }}>
                    Upcoming Maintenance
                  </Typography>
                  <Stack sx={{ gap: 1.5 }}>
                    {statusQuery.data.upcomingMaintenance.map((window, index) => (
                      <Card key={`${window.projectId}-${window.startsAt}-${index}`}>
                        <CardContent>
                          <Typography variant="body1">
                            {window.projectName}: {window.reason}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(window.startsAt)} → {formatDateTime(window.endsAt)}
                          </Typography>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                </Box>
              )}

              <Divider />
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
                Powered by ProjectOps
              </Typography>
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
