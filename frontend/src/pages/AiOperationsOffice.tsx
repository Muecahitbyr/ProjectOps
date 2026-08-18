import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useOrganizations } from "../hooks/useOrganizations";
import { useAttentionList, useOperationalState } from "../hooks/useResilience";
import { useSlos } from "../hooks/useSlo";
import { useAutomationRules } from "../hooks/useAutomationRules";
import { useAutomationActions } from "../hooks/useAutomationActions";
import { useAutomationExecutions } from "../hooks/useAutomationExecutions";
import { useDashboardEvents } from "../hooks/useDashboard";
import { OfficeMetricsBar } from "../components/ai-office/OfficeMetricsBar";
import { LiveActivityStrip } from "../components/ai-office/LiveActivityStrip";
import { OfficeFloorScene } from "../components/ai-office/OfficeFloorScene";
import { DecisionSpotlight } from "../components/ai-office/DecisionSpotlight";
import { OfficeDetailDrawer } from "../components/ai-office/OfficeDetailDrawer";
import type { OfficeSelection } from "../components/ai-office/OfficeDetailDrawer";
import { CommunicationBubbles } from "../components/ai-office/CommunicationBubbles";
import { DEPARTMENTS, buildAgentSnapshots, departmentForAttentionKind } from "../components/ai-office/officeConfig";
import type { AgentSnapshot } from "../components/ai-office/officeConfig";
import { getErrorMessage } from "../utils/getErrorMessage";
import type { ResilienceRange } from "../types/resilience.types";
import type { AttentionItem } from "../types/attention.types";

const RANGE_OPTIONS: { value: ResilienceRange; label: string }[] = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
  { value: "90d", label: "Last 90d" },
];

// "AI Operations Office" - eine visuelle Buero-Metapher (Abteilungen, KI-
// Mitarbeiter an Arbeitsplaetzen, Aufgaben-Warteschlangen) ausschliesslich
// ueber bereits bestehende Backend-Endpunkte: Attention List (Phase 64),
// Operational State (Phase 63), Automation Rules/Actions/Executions (Phase
// 9-11/30), SLOs (Phase 22), Dashboard Events (Phase 1). Keine neue Engine,
// keine neue Datenquelle - reine Visualisierungsschicht ueber core/
// attention.ts und core/operational-state.ts, die bislang (Bestandsanalyse
// bestaetigt) noch KEINEN Frontend-Konsumenten hatten.
//
// Phase 2 "Polish" - Performance: alle teuren Ableitungen (agents,
// agentsByDepartment, tasksByDepartment, workingAgents) sind useMemo'isiert;
// die an memo()isierte Kindkomponenten (DepartmentBoard/AgentCard/TaskCard)
// durchgereichten Handler sind useCallback'isiert, damit ein Update in EINER
// Abteilung nicht alle anderen neu rendert. Keine der hier genutzten Queries
// setzt ein eigenes Polling-Intervall - Frische kommt ausschliesslich ueber
// die bereits bestehende Realtime-Praefix-Invalidierung (hooks/useRealtime.ts).
export function AiOperationsOffice() {
  const [organizationId, setOrganizationId] = useState("");
  const [range, setRange] = useState<ResilienceRange>("7d");
  const [selection, setSelection] = useState<OfficeSelection>(null);

  const organizationsQuery = useOrganizations();
  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current) return;
    const firstOrg = organizationsQuery.data?.[0];
    if (firstOrg) {
      hasAutoSelected.current = true;
      setOrganizationId(firstOrg.id);
    }
  }, [organizationsQuery.data]);

  const enabled = Boolean(organizationId);
  const params = useMemo(() => ({ organizationId, range }), [organizationId, range]);

  const attentionListQuery = useAttentionList({ ...params, limit: 100 }, enabled);
  const operationalStateQuery = useOperationalState(params, enabled);
  const slosQuery = useSlos({ organizationId }, enabled);
  // Automation Rules/Actions/Executions sind (wie die zugrunde liegende
  // /automation-rules-, /automation-actions- und /automation-executions-
  // Route selbst) bewusst NICHT nach Organisation gefiltert - dieselbe
  // "Shared Ops Console"-Konvention wie ueberall sonst in diesem System
  // (siehe CLAUDE.md), unabhaengig vom Organisations-Filter oben.
  const rulesQuery = useAutomationRules();
  const actionsQuery = useAutomationActions();
  const executionsQuery = useAutomationExecutions({ limit: 200 });
  const eventsQuery = useDashboardEvents(30);

  const agents = useMemo(
    () => buildAgentSnapshots(rulesQuery.data ?? [], actionsQuery.data ?? [], executionsQuery.data ?? []),
    [rulesQuery.data, actionsQuery.data, executionsQuery.data],
  );
  const runningExecutions = useMemo(
    () => (executionsQuery.data ?? []).filter((e) => e.status === "RUNNING" || e.status === "CREATED"),
    [executionsQuery.data],
  );
  const workingAgents = useMemo(() => agents.filter((a) => a.status === "WORKING"), [agents]);

  const agentsByDepartment = useMemo(() => {
    const map = new Map<string, typeof agents>();
    for (const dept of DEPARTMENTS) map.set(dept.id, []);
    for (const agent of agents) map.get(agent.department)?.push(agent);
    return map;
  }, [agents]);

  const tasksByDepartment = useMemo(() => {
    const items = attentionListQuery.data?.items ?? [];
    const map = new Map<string, typeof items>();
    for (const dept of DEPARTMENTS) map.set(dept.id, []);
    for (const item of items) map.get(departmentForAttentionKind(item.kind))?.push(item);
    return map;
  }, [attentionListQuery.data]);

  const handleSelectAgent = useCallback((agent: AgentSnapshot) => setSelection({ type: "agent", agent }), []);
  const handleSelectTask = useCallback((task: AttentionItem) => setSelection({ type: "task", task }), []);
  const handleCloseDrawer = useCallback(() => setSelection(null), []);

  const isLoading = enabled && (attentionListQuery.isLoading || operationalStateQuery.isLoading || rulesQuery.isLoading);
  const firstError = attentionListQuery.error ?? operationalStateQuery.error ?? rulesQuery.error ?? actionsQuery.error ?? executionsQuery.error;

  return (
    <PageContainer title="AI Operations Office">
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
            <TextField
              select
              size="small"
              label="Organization"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
              sx={{ minWidth: 220 }}
            >
              {(organizationsQuery.data ?? []).map((org) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Range" value={range} onChange={(event) => setRange(event.target.value as ResilienceRange)} sx={{ minWidth: 160 }}>
              {RANGE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      {!enabled ? (
        <LoadingState label="Loading organizations..." />
      ) : isLoading ? (
        <LoadingState label="Opening the office..." />
      ) : firstError ? (
        <ErrorState message={getErrorMessage(firstError)} onRetry={() => attentionListQuery.refetch()} />
      ) : (
        <Stack spacing={3}>
          <OfficeMetricsBar
            attentionList={attentionListQuery.data}
            operationalState={operationalStateQuery.data}
            slos={slosQuery.data}
            runningExecutions={runningExecutions}
          />

          <LiveActivityStrip workingAgents={workingAgents} onSelectAgent={handleSelectAgent} />

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <OfficeFloorScene
                departments={DEPARTMENTS}
                agentsByDepartment={agentsByDepartment}
                tasksByDepartment={tasksByDepartment}
                onSelectAgent={handleSelectAgent}
                onSelectTask={handleSelectTask}
              />
            </Grid>

            <Grid size={{ xs: 12, lg: 4 }}>
              <Stack spacing={2}>
                <DecisionSpotlight items={attentionListQuery.data?.items ?? []} />
                <Card variant="outlined">
                  <CardContent>
                    <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: "center" }}>
                      <ChatBubbleOutlineOutlinedIcon fontSize="small" color="primary" />
                      <Typography variant="h4">Company Activity</Typography>
                    </Stack>
                    {eventsQuery.isLoading ? (
                      <LoadingState label="Loading activity..." minHeight={100} />
                    ) : (
                      <Box sx={{ maxHeight: 420, overflowY: "auto" }}>
                        <CommunicationBubbles events={eventsQuery.data ?? []} />
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Stack>
            </Grid>
          </Grid>
        </Stack>
      )}

      <OfficeDetailDrawer selection={selection} onClose={handleCloseDrawer} />
    </PageContainer>
  );
}
