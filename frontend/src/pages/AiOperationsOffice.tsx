import { useCallback, useMemo, useState } from "react";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useProjectsHealth } from "../hooks/useProjects";
import { useAutomationRules } from "../hooks/useAutomationRules";
import { useAutomationActions } from "../hooks/useAutomationActions";
import { useAutomationExecutions } from "../hooks/useAutomationExecutions";
import { OfficeFloorScene } from "../components/ai-office/OfficeFloorScene";
import type { OfficeAgentWithProjectType } from "../components/ai-office/OfficeFloorScene";
import { OfficeDetailDrawer } from "../components/ai-office/OfficeDetailDrawer";
import type { OfficeSelection } from "../components/ai-office/OfficeDetailDrawer";
import { buildAgentSnapshots } from "../components/ai-office/officeConfig";
import type { AgentSnapshot } from "../components/ai-office/officeConfig";
import { getErrorMessage } from "../utils/getErrorMessage";

// "KI-Büro" - auf ausdruecklichen Nutzerwunsch NUR die reine Buero-
// Visualisierung, keine Kennzahlen-Kacheln/Listen/Filter mehr. Gliederung
// "Meine Projekte"/"Kundenprojekte" x "Apps"/"Webseiten" nutzt ausschliesslich
// bereits bestehende, echte Daten: Automation Rules/Actions/Executions
// (Phase 9-11/30) fuer die Personen/Zustaende, ProjectHealthSummary.type
// (bereits bestehender /api/dashboard/projects-Endpunkt, Phase 1) fuer die
// Apps/Webseiten-Einordnung. Keine neue Engine, keine neue Datenquelle.
export function AiOperationsOffice() {
  const [selection, setSelection] = useState<OfficeSelection>(null);

  const projectsQuery = useProjectsHealth();
  // Automation Rules/Actions/Executions sind (wie die zugrunde liegende
  // /automation-rules-, /automation-actions- und /automation-executions-
  // Route selbst) bewusst NICHT nach Organisation gefiltert - dieselbe
  // "Shared Ops Console"-Konvention wie ueberall sonst in diesem System
  // (siehe CLAUDE.md).
  const rulesQuery = useAutomationRules();
  const actionsQuery = useAutomationActions();
  const executionsQuery = useAutomationExecutions({ limit: 200 });

  const projectTypeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projectsQuery.data ?? []) map.set(project.id, project.type);
    return map;
  }, [projectsQuery.data]);

  const agents = useMemo(
    () => buildAgentSnapshots(rulesQuery.data ?? [], actionsQuery.data ?? [], executionsQuery.data ?? []),
    [rulesQuery.data, actionsQuery.data, executionsQuery.data],
  );

  // "Kundenprojekte" bleibt bewusst ehrlich leer: es gibt in den echten
  // Projektdaten aktuell kein Feld, das ein Projekt als "Kunde" markiert -
  // alle bestehenden Projekte laufen daher unter "Meine Projekte", nach
  // echtem project.type (website/mobile-app/api) in Apps/Webseiten sortiert.
  const agentsWithType: OfficeAgentWithProjectType[] = useMemo(
    () => agents.map((agent) => ({ ...agent, projectType: projectTypeById.get(agent.rule.projectId) === "website" ? "website" : "app" })),
    [agents, projectTypeById],
  );

  const handleSelectAgent = useCallback((agent: AgentSnapshot) => setSelection({ type: "agent", agent }), []);
  const handleCloseDrawer = useCallback(() => setSelection(null), []);

  const isLoading = projectsQuery.isLoading || rulesQuery.isLoading || actionsQuery.isLoading || executionsQuery.isLoading;
  const firstError = projectsQuery.error ?? rulesQuery.error ?? actionsQuery.error ?? executionsQuery.error;

  return (
    <PageContainer title="KI-Büro">
      {isLoading ? (
        <LoadingState label="Opening the office..." />
      ) : firstError ? (
        <ErrorState message={getErrorMessage(firstError)} onRetry={() => rulesQuery.refetch()} />
      ) : (
        <OfficeFloorScene agents={agentsWithType} onSelectAgent={handleSelectAgent} />
      )}

      <OfficeDetailDrawer selection={selection} onClose={handleCloseDrawer} />
    </PageContainer>
  );
}
