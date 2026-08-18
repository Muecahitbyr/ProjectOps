import { memo } from "react";
import Grid from "@mui/material/Grid";
import ConfirmationNumberOutlinedIcon from "@mui/icons-material/ConfirmationNumberOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { KpiTile } from "./KpiTile";
import { healthStatusColors, severityColors } from "../../theme/statusColors";
import { formatDuration, formatPercent } from "../../utils/formatters";
import type { AttentionList } from "../../types/attention.types";
import type { OperationalStateOverview } from "../../types/operational-state.types";
import type { SloWithCurrentStatus } from "../../types/slo.types";
import type { AutomationExecution } from "../../types/automation.types";

interface OfficeMetricsBarProps {
  attentionList: AttentionList | undefined;
  operationalState: OperationalStateOverview | undefined;
  slos: SloWithCurrentStatus[] | undefined;
  runningExecutions: AutomationExecution[] | undefined;
}

// Alle acht Kennzahlen stammen 1:1 aus bereits bestehenden Backend-
// Aggregationen (Attention List/Phase 64, Operational State/Phase 63, SLO/
// Phase 22, Automation Executions/Phase 30) - keine neue Berechnung. "Outcome
// Quality" ersetzt bewusst eine erfundene "Zufriedenheit": es gibt keine
// echte Nutzerzufriedenheits-Kennzahl im Backend, GOOD-Anteil der
// Entscheidungsqualitaet (Phase 62) ist der naechstliegende reale Ersatz und
// wird ehrlich so benannt statt eine Kennzahl vorzutaeuschen.
export const OfficeMetricsBar = memo(function OfficeMetricsBar({ attentionList, operationalState, slos, runningExecutions }: OfficeMetricsBarProps) {
  const openTickets = attentionList?.items.length ?? 0;
  const criticalServices = operationalState?.criticalServiceCount ?? 0;
  const atRiskServices = operationalState?.atRiskServiceCount ?? 0;
  const runningTasks = runningExecutions?.length ?? 0;

  const avgLatency = operationalState?.avgDecisionLatencyMs ?? null;

  const sloHealthy = (slos ?? []).filter((s) => s.current?.errorBudget.status === "HEALTHY").length;
  const sloTotal = slos?.length ?? 0;
  const sloValue = sloTotal > 0 ? `${sloHealthy}/${sloTotal}` : "–";

  const qualityCounts = operationalState?.decisionQualityCounts;
  const qualityTotal = qualityCounts ? Object.values(qualityCounts).reduce((a, b) => a + b, 0) : 0;
  const outcomeQuality = qualityTotal > 0 && qualityCounts ? formatPercent((qualityCounts.GOOD / qualityTotal) * 100) : "–";

  const activeRiskSignals = (operationalState?.riskCorrelationGroups.length ?? 0) + (operationalState?.cumulativeRiskServices.length ?? 0);

  const tiles = [
    { label: "Open Tickets", value: openTickets, icon: <ConfirmationNumberOutlinedIcon />, accentColor: severityColors.MEDIUM },
    { label: "Critical Services", value: criticalServices, icon: <ReportProblemOutlinedIcon />, accentColor: healthStatusColors.critical },
    { label: "At Risk", value: atRiskServices, icon: <WarningAmberOutlinedIcon />, accentColor: healthStatusColors.warning },
    { label: "Running Tasks", value: runningTasks, icon: <BoltOutlinedIcon />, accentColor: "#3b82f6" },
    { label: "Avg Response Time", value: formatDuration(avgLatency), icon: <ScheduleOutlinedIcon />, accentColor: "text.primary" },
    { label: "SLOs Healthy", value: sloValue, icon: <TrackChangesOutlinedIcon />, accentColor: healthStatusColors.healthy },
    { label: "Outcome Quality", value: outcomeQuality, icon: <ThumbUpOutlinedIcon />, accentColor: healthStatusColors.healthy },
    { label: "Active Risk Signals", value: activeRiskSignals, icon: <ShieldOutlinedIcon />, accentColor: severityColors.HIGH },
  ];

  return (
    <Grid container spacing={2}>
      {tiles.map((tile) => (
        <Grid key={tile.label} size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiTile {...tile} />
        </Grid>
      ))}
    </Grid>
  );
});
