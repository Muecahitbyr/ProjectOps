import { useCallback, useMemo, useState } from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useProjectsHealth } from "../hooks/useProjects";
import { useAutomationRules } from "../hooks/useAutomationRules";
import { useAutomationActions } from "../hooks/useAutomationActions";
import { useAutomationExecutions } from "../hooks/useAutomationExecutions";
import { useIncidents } from "../hooks/useIncidents";
import type { Incident } from "../types/incident.types";
import { OfficeFloorScene } from "../components/ai-office/OfficeFloorScene";
import type { OfficeAgentWithProjectType } from "../components/ai-office/OfficeFloorScene";
import { OfficeDetailDrawer } from "../components/ai-office/OfficeDetailDrawer";
import type { OfficeSelection } from "../components/ai-office/OfficeDetailDrawer";
import { buildAgentSnapshots } from "../components/ai-office/officeConfig";
import type { AgentStatus } from "../components/ai-office/officeConfig";
import { TodosInboxPanel } from "../components/ai-office/TodosInboxPanel";
import { getErrorMessage } from "../utils/getErrorMessage";

// Kurzform des echten Projektnamens fuer die Schreibtisch-Beschriftung
// (Nutzerwunsch: "DriveConnect" -> "DC", "GuessTheCapitalCity" -> "GTCC") -
// rein deterministisch aus dem echten Projektnamen abgeleitet, keine fest
// verdrahtete Liste erfundener Kuerzel: PascalCase-Namen liefern ihre
// Grossbuchstaben-Folge ("DriveConnect" -> "DC"), sonst die Anfangsbuchstaben
// der durch Nicht-Buchstaben getrennten Teile ("bayar-solutions.de" ->
// "BSD"), sonst die ersten zwei Buchstaben ("Rechno" -> "RE").
function abbreviateProjectName(name: string): string {
  const capitals = name.match(/[A-Z]/g);
  if (capitals && capitals.length >= 2) return capitals.join("");
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length >= 2) return parts.map((part) => part[0]!.toUpperCase()).join("");
  return name.slice(0, 2).toUpperCase();
}

// "Schlechtester Status zuerst" - bestimmt, welche der zusammengefassten
// Regeln eines Projekts den sichtbaren Zustand des gemeinsamen Schreibtischs
// vorgibt (z.B. Rechno: wenn eine der beiden Regeln BLOCKED ist, brennt der
// EINE Schreibtisch, auch wenn die andere Regel gerade IDLE ist).
const STATUS_PRIORITY: Record<AgentStatus, number> = { BLOCKED: 0, WAITING: 1, WORKING: 2, IDLE: 3, COMPLETED: 4 };

// "KI-Büro" - auf ausdruecklichen Nutzerwunsch NUR die reine Buero-
// Visualisierung, keine Kennzahlen-Kacheln/Listen/Filter mehr. Gliederung
// "Meine Projekte"/"Kundenprojekte" x "Apps"/"Webseiten" nutzt ausschliesslich
// bereits bestehende, echte Daten: Automation Rules/Actions/Executions
// (Phase 9-11/30) fuer die Personen/Zustaende, ProjectHealthSummary.type
// (bereits bestehender /api/dashboard/projects-Endpunkt, Phase 1) fuer die
// Apps/Webseiten-Einordnung. Keine neue Engine, keine neue Datenquelle.
export function AiOperationsOffice() {
  const [selection, setSelection] = useState<OfficeSelection>(null);
  // Zweiter Reiter neben der Buero-Visualisierung (Nutzerwunsch: Todos +
  // Postfach-Uebersicht "unter KI-Buero"). Reiner UI-Zustand, keine eigene
  // Route - beide Reiter teilen sich denselben Seitentitel/-rahmen.
  const [tab, setTab] = useState<"office" | "inbox">("office");

  const projectsQuery = useProjectsHealth();
  // Automation Rules/Actions/Executions sind (wie die zugrunde liegende
  // /automation-rules-, /automation-actions- und /automation-executions-
  // Route selbst) bewusst NICHT nach Organisation gefiltert - dieselbe
  // "Shared Ops Console"-Konvention wie ueberall sonst in diesem System
  // (siehe CLAUDE.md).
  const rulesQuery = useAutomationRules();
  const actionsQuery = useAutomationActions();
  const executionsQuery = useAutomationExecutions({ limit: 200 });
  // Echte offene Incidents (bereits bestehender /api/incidents-Endpunkt,
  // Phase 21) - liefert den tatsaechlichen Grund ("wieso brennt es"), nicht
  // nur einen Zaehler. Nicht nach Organisation gefiltert, dieselbe "Shared
  // Ops Console"-Konvention wie die anderen Queries hier.
  const incidentsQuery = useIncidents({ resolved: false, limit: 200 });

  const projectTypeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projectsQuery.data ?? []) map.set(project.id, project.type);
    return map;
  }, [projectsQuery.data]);

  // Echter Projektname (dashboard/projects) fuer Schreibtisch-Titel/-Kuerzel
  // - dieselbe Quelle wie projectTypeById.
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projectsQuery.data ?? []) map.set(project.id, project.name);
    return map;
  }, [projectsQuery.data]);

  // Echter Projekt-Zustand (bereits bestehender /api/dashboard/projects-
  // Endpunkt, derselbe wie fuer projectTypeById) - unabhaengig vom
  // Automation-Rule-Status: eine Regel kann selbst erfolgreich laufen
  // (z.B. "Snapshot on Check Failure" schlaegt erfolgreich an), waehrend
  // das Projekt, um das es eigentlich geht, echten kritischen Health-Status
  // oder offene Incidents hat. Der brennende Schreibtisch soll BEIDES
  // abdecken, nicht nur eine fehlgeschlagene Automation-Ausfuehrung.
  const projectHealthById = useMemo(() => {
    const map = new Map<string, { critical: boolean; openIncidents: number }>();
    for (const project of projectsQuery.data ?? []) {
      map.set(project.id, { critical: project.health.status === "critical", openIncidents: project.openIncidents });
    }
    return map;
  }, [projectsQuery.data]);

  // Echte offene Incidents je Projekt gruppiert - das ist der konkrete Grund,
  // der beim Klick auf einen brennenden Schreibtisch angezeigt wird (siehe
  // OfficeDetailDrawer), statt nur "Projekt kritisch" ohne Erklaerung.
  const openIncidentsByProject = useMemo(() => {
    const map = new Map<string, Incident[]>();
    for (const incident of incidentsQuery.data ?? []) {
      const list = map.get(incident.projectId);
      if (list) list.push(incident);
      else map.set(incident.projectId, [incident]);
    }
    return map;
  }, [incidentsQuery.data]);

  const agents = useMemo(
    () => buildAgentSnapshots(rulesQuery.data ?? [], actionsQuery.data ?? [], executionsQuery.data ?? []),
    [rulesQuery.data, actionsQuery.data, executionsQuery.data],
  );

  // "Kundenprojekte" bleibt bewusst ehrlich leer: es gibt in den echten
  // Projektdaten aktuell kein Feld, das ein Projekt als "Kunde" markiert -
  // alle bestehenden Projekte laufen daher unter "Meine Projekte", nach
  // echtem project.type (website/mobile-app/api) in Apps/Webseiten sortiert.
  const agentsWithType: OfficeAgentWithProjectType[] = useMemo(
    () =>
      agents.map((agent) => ({
        ...agent,
        projectType: projectTypeById.get(agent.rule.projectId) === "website" ? "website" : "app",
        projectHealth: projectHealthById.get(agent.rule.projectId) ?? null,
        openIncidents: openIncidentsByProject.get(agent.rule.projectId) ?? [],
        deskId: agent.rule.projectId,
        deskLabel: abbreviateProjectName(projectNameById.get(agent.rule.projectId) ?? agent.rule.projectId),
        projectName: projectNameById.get(agent.rule.projectId) ?? agent.rule.projectId,
        groupedRules: [agent],
      })),
    [agents, projectTypeById, projectHealthById, openIncidentsByProject, projectNameById],
  );

  // Nutzerwunsch: "ein Schreibtisch pro Projekt" statt "ein Schreibtisch pro
  // Automation Rule" - Projekte mit mehreren echten Regeln (z.B. Rechno,
  // bayar-solutions.de) bekommen dadurch nur EINEN gemeinsamen Schreibtisch
  // ("2 in einem") statt einen je Regel. Der sichtbare Status kommt von der
  // jeweils "schlechtesten" Regel (STATUS_PRIORITY); alle echten Regeln
  // bleiben ueber groupedRules erreichbar (siehe OfficeDetailDrawer).
  const deskAgents: OfficeAgentWithProjectType[] = useMemo(() => {
    const byProject = new Map<string, OfficeAgentWithProjectType[]>();
    for (const agent of agentsWithType) {
      const list = byProject.get(agent.rule.projectId);
      if (list) list.push(agent);
      else byProject.set(agent.rule.projectId, [agent]);
    }
    const result: OfficeAgentWithProjectType[] = [];
    for (const group of byProject.values()) {
      const sortedByName = [...group].sort((a, b) => a.rule.name.localeCompare(b.rule.name));
      const representative = [...sortedByName].sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status])[0]!;
      result.push({ ...representative, groupedRules: sortedByName.map(({ rule, department, status, latestAction, latestExecution }) => ({ rule, department, status, latestAction, latestExecution })) });
    }
    return result;
  }, [agentsWithType]);

  const handleSelectAgent = useCallback((agent: OfficeAgentWithProjectType) => setSelection({ type: "agent", agent }), []);
  const handleCloseDrawer = useCallback(() => setSelection(null), []);

  const isLoading =
    projectsQuery.isLoading || rulesQuery.isLoading || actionsQuery.isLoading || executionsQuery.isLoading || incidentsQuery.isLoading;
  const firstError = projectsQuery.error ?? rulesQuery.error ?? actionsQuery.error ?? executionsQuery.error ?? incidentsQuery.error;

  const projectOptions = useMemo(
    () => (projectsQuery.data ?? []).map((project) => ({ id: project.id, name: project.name })),
    [projectsQuery.data],
  );

  return (
    <PageContainer title="KI-Büro">
      <Tabs value={tab} onChange={(_e, value: "office" | "inbox") => setTab(value)} sx={{ mb: 2, minHeight: 0 }}>
        <Tab value="office" label="Büro" sx={{ minHeight: 0 }} />
        <Tab value="inbox" label="Todos & Postfach" sx={{ minHeight: 0 }} />
      </Tabs>

      {isLoading ? (
        <LoadingState label="Opening the office..." />
      ) : firstError ? (
        <ErrorState message={getErrorMessage(firstError)} onRetry={() => rulesQuery.refetch()} />
      ) : (
        <>
          <Box sx={{ display: tab === "office" ? "block" : "none" }}>
            <OfficeFloorScene agents={deskAgents} onSelectAgent={handleSelectAgent} />
          </Box>
          {tab === "inbox" ? <TodosInboxPanel projects={projectOptions} /> : null}
        </>
      )}

      <OfficeDetailDrawer selection={selection} onClose={handleCloseDrawer} />
    </PageContainer>
  );
}
