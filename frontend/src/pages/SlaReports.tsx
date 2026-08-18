import { useState } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { SlaSummaryGrid } from "../components/analytics/SlaSummaryGrid";
import { StatsCard } from "../components/dashboard/StatsCard";
import { ExportMenu } from "../components/analytics/ExportMenu";
import { useProjectsHealth } from "../hooks/useProjects";
import { useSlaReport } from "../hooks/useSlaReport";
import { getErrorMessage } from "../utils/getErrorMessage";
import type { SlaReport } from "../types/sla-report.types";
import type { ExportColumn } from "../utils/export";

const HOURS_OPTIONS = [
  { value: 24, label: "Last 24h" },
  { value: 24 * 7, label: "Last 7d" },
  { value: 24 * 30, label: "Last 30d" },
  { value: 24 * 90, label: "Last 90d" },
];

// ExportColumn arbeitet mit flachen keyof T-Zugriffen - SlaReport verschachtelt
// die eigentlichen SLA-Kennzahlen unter .sla, daher hier auf eine flache
// Export-Zeile abgebildet statt ExportColumn um Funktions-Keys zu erweitern.
interface SlaReportRow {
  projectName: string;
  generatedAt: string;
  slaPercent: number;
  availabilityPercent: number;
  totalDowntimeMs: number;
  outageCount: number;
  mttrMs: number | string;
  mtbfMs: number | string;
  incidentCount: number;
  alertTriggerCount: number;
  automationExecutionCount: number;
}

function toReportRow(report: SlaReport): SlaReportRow {
  return {
    projectName: report.projectName,
    generatedAt: report.generatedAt,
    slaPercent: report.sla.slaPercent,
    availabilityPercent: report.sla.availabilityPercent,
    totalDowntimeMs: report.sla.totalDowntimeMs,
    outageCount: report.sla.outageCount,
    mttrMs: report.sla.mttrMs ?? "",
    mtbfMs: report.sla.mtbfMs ?? "",
    incidentCount: report.incidentCount,
    alertTriggerCount: report.alertTriggerCount,
    automationExecutionCount: report.automationExecutionCount,
  };
}

const SLA_REPORT_COLUMNS: ExportColumn<SlaReportRow>[] = [
  { key: "projectName", label: "Project" },
  { key: "generatedAt", label: "Generated At" },
  { key: "slaPercent", label: "SLA (%)" },
  { key: "availabilityPercent", label: "Availability (%)" },
  { key: "totalDowntimeMs", label: "Downtime (ms)" },
  { key: "outageCount", label: "Outages" },
  { key: "mttrMs", label: "MTTR (ms)" },
  { key: "mtbfMs", label: "MTBF (ms)" },
  { key: "incidentCount", label: "Incidents" },
  { key: "alertTriggerCount", label: "Alert Triggers" },
  { key: "automationExecutionCount", label: "Automation Executions" },
];

// Phase 13 Teil 6 "SLA Reports" - buendelt getProjectSla() (bereits
// bestehende Analytics-Berechnung) mit Vorfall-/Alert-/Automation-
// Zaehlungen (sla-report.repository.ts). Export nutzt exakt dasselbe
// utils/export.ts wie die bestehende Analytics-Seite.
export function SlaReports() {
  const [projectId, setProjectId] = useState("");
  const [hours, setHours] = useState(24 * 30);
  const projectsQuery = useProjectsHealth();
  const reportQuery = useSlaReport(projectId || undefined, hours);

  return (
    <PageContainer title="SLA Reports">
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2, mb: 3 }}>
        <Stack direction="row" sx={{ gap: 2 }}>
          <TextField select label="Project" size="small" value={projectId} onChange={(event) => setProjectId(event.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="">Select a project</MenuItem>
            {(projectsQuery.data ?? []).map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Period" size="small" value={hours} onChange={(event) => setHours(Number(event.target.value))} sx={{ minWidth: 160 }}>
            {HOURS_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <ExportMenu
          data={reportQuery.data ? [toReportRow(reportQuery.data)] : []}
          columns={SLA_REPORT_COLUMNS}
          filename={`sla-report-${projectId || "project"}`}
          title="SLA Report"
        />
      </Stack>

      {!projectId ? (
        <EmptyState message="Select a project above to generate its SLA report." minHeight={300} />
      ) : reportQuery.isLoading ? (
        <LoadingState label="Loading SLA report..." minHeight={300} />
      ) : reportQuery.isError || !reportQuery.data ? (
        <ErrorState message={getErrorMessage(reportQuery.error)} onRetry={() => reportQuery.refetch()} minHeight={300} />
      ) : (
        <Stack sx={{ gap: 3 }}>
          <Typography variant="h4">{reportQuery.data.projectName}</Typography>
          <SlaSummaryGrid sla={reportQuery.data.sla} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 4 }}>
              <StatsCard label="Incidents" value={reportQuery.data.incidentCount} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <StatsCard label="Alert Triggers" value={reportQuery.data.alertTriggerCount} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <StatsCard label="Automation Executions" value={reportQuery.data.automationExecutionCount} />
            </Grid>
          </Grid>
        </Stack>
      )}
    </PageContainer>
  );
}
