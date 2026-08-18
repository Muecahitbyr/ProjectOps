import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useOrganizations } from "../hooks/useOrganizations";
import { useAttentionList } from "../hooks/useResilience";
import { useAutomationRules } from "../hooks/useAutomationRules";
import { useAutomationActions } from "../hooks/useAutomationActions";
import { useAutomationExecutions } from "../hooks/useAutomationExecutions";
import { OfficeFloorScene } from "../components/ai-office/OfficeFloorScene";
import { OfficeDetailDrawer } from "../components/ai-office/OfficeDetailDrawer";
import type { OfficeSelection } from "../components/ai-office/OfficeDetailDrawer";
import { DEPARTMENTS, buildAgentSnapshots } from "../components/ai-office/officeConfig";
import type { AgentSnapshot } from "../components/ai-office/officeConfig";
import { getErrorMessage } from "../utils/getErrorMessage";

// "KI-Büro" - auf ausdruecklichen Nutzerwunsch NUR die reine Buero-
// Visualisierung, keine Kennzahlen-Kacheln/Listen/Filter mehr (siehe
// Abschlussbericht-Chat: "ich möchte nur es visualisiert sehen"). Datenlage
// unveraendert ausschliesslich echte, bestehende Endpunkte: Automation
// Rules/Actions/Executions (Phase 9-11/30) fuer die Personen/Zustaende,
// Attention List (Phase 64) bleibt fuer den Klick-Drawer nutzbar. Keine neue
// Engine, keine neue Datenquelle - reine Visualisierungsschicht.
export function AiOperationsOffice() {
  const [organizationId, setOrganizationId] = useState("");
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
  // Range fest auf 7d - die Auswahl war Teil der entfernten Filterleiste,
  // die Attention List (fuer den Detail-Drawer) braucht aber weiterhin einen
  // Zeitraum-Parameter.
  const params = useMemo(() => ({ organizationId, range: "7d" as const }), [organizationId]);

  const attentionListQuery = useAttentionList({ ...params, limit: 100 }, enabled);
  // Automation Rules/Actions/Executions sind (wie die zugrunde liegende
  // /automation-rules-, /automation-actions- und /automation-executions-
  // Route selbst) bewusst NICHT nach Organisation gefiltert - dieselbe
  // "Shared Ops Console"-Konvention wie ueberall sonst in diesem System
  // (siehe CLAUDE.md), unabhaengig vom Organisations-Filter oben.
  const rulesQuery = useAutomationRules();
  const actionsQuery = useAutomationActions();
  const executionsQuery = useAutomationExecutions({ limit: 200 });

  const agents = useMemo(
    () => buildAgentSnapshots(rulesQuery.data ?? [], actionsQuery.data ?? [], executionsQuery.data ?? []),
    [rulesQuery.data, actionsQuery.data, executionsQuery.data],
  );

  const agentsByDepartment = useMemo(() => {
    const map = new Map<string, typeof agents>();
    for (const dept of DEPARTMENTS) map.set(dept.id, []);
    for (const agent of agents) map.get(agent.department)?.push(agent);
    return map;
  }, [agents]);

  const handleSelectAgent = useCallback((agent: AgentSnapshot) => setSelection({ type: "agent", agent }), []);
  const handleCloseDrawer = useCallback(() => setSelection(null), []);

  const isLoading = enabled && (rulesQuery.isLoading || actionsQuery.isLoading || executionsQuery.isLoading);
  const firstError = attentionListQuery.error ?? rulesQuery.error ?? actionsQuery.error ?? executionsQuery.error;

  return (
    <PageContainer title="KI-Büro">
      {!enabled ? (
        <LoadingState label="Loading..." />
      ) : isLoading ? (
        <LoadingState label="Opening the office..." />
      ) : firstError ? (
        <ErrorState message={getErrorMessage(firstError)} onRetry={() => rulesQuery.refetch()} />
      ) : (
        <OfficeFloorScene departments={DEPARTMENTS} agentsByDepartment={agentsByDepartment} onSelectAgent={handleSelectAgent} />
      )}

      <OfficeDetailDrawer selection={selection} onClose={handleCloseDrawer} />
    </PageContainer>
  );
}
