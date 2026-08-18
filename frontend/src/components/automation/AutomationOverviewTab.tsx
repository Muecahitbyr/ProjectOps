import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { StatsCard } from "../dashboard/StatsCard";
import { FrequencyList } from "../analytics/FrequencyList";
import { AutomationTrendChart } from "./AutomationTrendChart";
import { AutomationExecutionHeatmap } from "./AutomationExecutionHeatmap";
import { useAutomationAnalytics } from "../../hooks/useAutomationAnalytics";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDuration, formatPercent } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";

// Teil 7 "Analytics Integration" - Success Rate/Avg Runtime/Avg Approval
// Time als Kennzahlen, Top Trigger/Top Failed Action/Most Automated Project
// als Ranglisten (FrequencyList, wiederverwendet aus dem Analytics-Feature),
// Automation Trend als Liniendiagramm, Execution Heatmap als Wochentag x
// Stunde-Raster.
export function AutomationOverviewTab() {
  const query = useAutomationAnalytics();

  if (query.isLoading) {
    return <LoadingState label="Loading automation analytics..." minHeight={300} />;
  }
  if (query.isError || !query.data) {
    return <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={300} />;
  }

  const { successRate, averageDurationMs, averageApprovalTimeMs, topTriggers, topFailedActions, mostAutomatedProjects, trend, heatmap } = query.data;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatsCard label="Success rate" value={formatPercent(successRate.successRate * 100)} accentColor={healthStatusColors.healthy} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatsCard label="Average runtime" value={formatDuration(averageDurationMs)} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatsCard label="Average approval time" value={formatDuration(averageApprovalTimeMs)} />
      </Grid>

      <Grid size={{ xs: 12, md: 8 }}>
        <Card>
          <CardContent>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Automation trend
            </Typography>
            <AutomationTrendChart points={trend} />
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Top triggers
            </Typography>
            <FrequencyList
              entries={topTriggers.map((entry) => ({ key: entry.trigger, label: entry.trigger, count: entry.count }))}
              emptyMessage="No automation triggers fired yet."
            />
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Card>
          <CardContent>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Top failed actions
            </Typography>
            <FrequencyList
              entries={topFailedActions.map((entry) => ({ key: entry.action, label: entry.action, count: entry.failedCount }))}
              emptyMessage="No failed executions yet."
            />
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Card>
          <CardContent>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Most automated projects
            </Typography>
            <FrequencyList
              entries={mostAutomatedProjects.map((entry) => ({ key: entry.projectId, label: entry.projectId, count: entry.executionCount }))}
              emptyMessage="No automation executions yet."
            />
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12 }}>
        <Card>
          <CardContent>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Execution heatmap
            </Typography>
            <AutomationExecutionHeatmap cells={heatmap} />
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
