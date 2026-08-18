import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import { LoadingState } from "../common/LoadingState";
import { EmptyState } from "../common/EmptyState";
import { healthStatusColors } from "../../theme/statusColors";
import type { SloStatus, SloWithCurrentStatus } from "../../types/slo.types";

const SLO_STATUS_COLORS: Record<SloStatus, string> = {
  HEALTHY: healthStatusColors.healthy,
  DEGRADED: healthStatusColors.warning,
  CRITICAL: healthStatusColors.critical,
};

function statusOf(slo: SloWithCurrentStatus): SloStatus | "PENDING" {
  return slo.current?.errorBudget.status ?? "PENDING";
}

interface RankedListProps {
  title: string;
  items: SloWithCurrentStatus[];
  onSelect: (id: number) => void;
  renderValue: (slo: SloWithCurrentStatus) => string;
}

function RankedList({ title, items, onSelect, renderValue }: RankedListProps) {
  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          None
        </Typography>
      ) : (
        <Stack sx={{ gap: 0.75 }}>
          {items.map((slo) => {
            const status = statusOf(slo);
            return (
              <Stack
                key={slo.id}
                direction="row"
                sx={{ justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                onClick={() => onSelect(slo.id)}
              >
                <Typography variant="body2" noWrap sx={{ maxWidth: "60%" }}>
                  {slo.name}
                </Typography>
                <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
                  <Typography variant="caption" color="text.secondary">
                    {renderValue(slo)}
                  </Typography>
                  {status !== "PENDING" ? (
                    <Chip size="small" label={status} sx={{ backgroundColor: `${SLO_STATUS_COLORS[status]}1f`, color: SLO_STATUS_COLORS[status] }} />
                  ) : null}
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}

// Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service Health"
// Auftragspunkt 15 "Service Health Dashboard" - erweitert das bestehende
// Dashboard um eine kompakte Reliability-Uebersicht, wiederverwendet
// dieselben SLO-Daten wie /platform/slo (kein zweiter Berechnungspfad).
export function ServiceReliabilityPanel({ slos, isLoading }: { slos: SloWithCurrentStatus[]; isLoading: boolean }) {
  const navigate = useNavigate();

  const { breached, highestBurnRate, lowestAvailability } = useMemo(() => {
    const evaluated = slos.filter((s) => s.current !== null);
    const breachedList = evaluated.filter((s) => statusOf(s) === "CRITICAL").slice(0, 5);
    const byBurnRate = [...evaluated].sort((a, b) => (b.current?.errorBudget.burnRate ?? 0) - (a.current?.errorBudget.burnRate ?? 0)).slice(0, 5);
    const availabilityOnly = evaluated.filter((s) => s.sliType === "AVAILABILITY" || s.sliType === "API_AVAILABILITY");
    const byLowestAvailability = [...availabilityOnly].sort((a, b) => (a.current?.sliValue ?? 100) - (b.current?.sliValue ?? 100)).slice(0, 5);
    return { breached: breachedList, highestBurnRate: byBurnRate, lowestAvailability: byLowestAvailability };
  }, [slos]);

  return (
    <Card>
      <CardContent>
        <Typography variant="h3" sx={{ mb: 2 }}>
          Service Reliability
        </Typography>
        {isLoading ? (
          <LoadingState minHeight={140} />
        ) : slos.length === 0 ? (
          <EmptyState message="No SLOs configured yet." minHeight={140} />
        ) : (
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <RankedList title="Breached SLOs" items={breached} onSelect={(id) => navigate(`/platform/slo/${id}`)} renderValue={(s) => `${s.current?.sliValue}%`} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <RankedList
                title="Highest Burn Rate"
                items={highestBurnRate}
                onSelect={(id) => navigate(`/platform/slo/${id}`)}
                renderValue={(s) => `${s.current?.errorBudget.burnRate}x`}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <RankedList
                title="Lowest Availability"
                items={lowestAvailability}
                onSelect={(id) => navigate(`/platform/slo/${id}`)}
                renderValue={(s) => `${s.current?.sliValue}%`}
              />
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  );
}
