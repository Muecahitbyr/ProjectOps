import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useBackendHealth } from "../hooks/useBackendHealth";
import { getErrorMessage } from "../utils/getErrorMessage";
import { healthStatusColors } from "../theme/statusColors";
import {
  REFRESH_INTERVAL_DASHBOARD_MS,
  REFRESH_INTERVAL_EVENTS_MS,
  REFRESH_INTERVAL_INCIDENTS_MS,
  REFRESH_INTERVAL_TIMELINE_MS,
} from "../utils/constants";

interface SettingRowProps {
  label: string;
  value: string;
}

function SettingRow({ label, value }: SettingRowProps) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", py: 1 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Typography>
    </Stack>
  );
}

// Zeigt ausschliesslich echte Laufzeit-Konfiguration und den tatsaechlichen
// Backend-Verbindungsstatus - keine editierbaren, aber erfundenen
// Einstellungen.
export function Settings() {
  const healthQuery = useBackendHealth();

  return (
    <PageContainer title="Settings">
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 1 }}>
                Backend Connection
              </Typography>
              {healthQuery.isLoading ? (
                <LoadingState minHeight={120} />
              ) : healthQuery.isError || !healthQuery.data ? (
                <ErrorState
                  message={getErrorMessage(healthQuery.error)}
                  onRetry={() => healthQuery.refetch()}
                  minHeight={120}
                />
              ) : (
                <Stack divider={<Divider />}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", py: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      API Base URL
                    </Typography>
                    <Typography variant="body2">{import.meta.env.VITE_API_URL}</Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", py: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Backend Status
                    </Typography>
                    <Chip
                      size="small"
                      label={healthQuery.data.status}
                      sx={{
                        backgroundColor: `${healthStatusColors.healthy}1f`,
                        color: healthStatusColors.healthy,
                      }}
                    />
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", py: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Database
                    </Typography>
                    <Chip
                      size="small"
                      label={healthQuery.data.database}
                      sx={{
                        backgroundColor:
                          healthQuery.data.database === "connected"
                            ? `${healthStatusColors.healthy}1f`
                            : `${healthStatusColors.critical}1f`,
                        color:
                          healthQuery.data.database === "connected"
                            ? healthStatusColors.healthy
                            : healthStatusColors.critical,
                      }}
                    />
                  </Stack>
                  <SettingRow label="Uptime" value={`${Math.floor(healthQuery.data.uptime)}s`} />
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 1 }}>
                Auto-Refresh Intervals
              </Typography>
              <Stack divider={<Divider />}>
                <SettingRow label="Dashboard" value={`${REFRESH_INTERVAL_DASHBOARD_MS / 1000}s`} />
                <SettingRow label="Live feed" value={`${REFRESH_INTERVAL_EVENTS_MS / 1000}s`} />
                <SettingRow label="Timeline" value={`${REFRESH_INTERVAL_TIMELINE_MS / 1000}s`} />
                <SettingRow label="Incidents" value={`${REFRESH_INTERVAL_INCIDENTS_MS / 1000}s`} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </PageContainer>
  );
}
