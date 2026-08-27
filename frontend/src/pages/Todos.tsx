import { useMemo } from "react";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useProjectsHealth } from "../hooks/useProjects";
import { TodosPanel } from "../components/ai-office/TodosPanel";
import { getErrorMessage } from "../utils/getErrorMessage";

// Eigene Seite (Nutzerwunsch: Todos gehoert in die Navbar/Sidebar, nicht als
// Reiter unter KI-Buero) - projects nur fuer die Kategorie-Vorschlagsliste
// im Panel, echter bereits bestehender /api/dashboard/projects-Endpunkt.
export function Todos() {
  const projectsQuery = useProjectsHealth();

  const projectOptions = useMemo(
    () => (projectsQuery.data ?? []).map((project) => ({ id: project.id, name: project.name })),
    [projectsQuery.data],
  );

  return (
    <PageContainer title="Todos">
      {projectsQuery.isLoading ? (
        <LoadingState label="Todos laden..." />
      ) : projectsQuery.error ? (
        <ErrorState message={getErrorMessage(projectsQuery.error)} onRetry={() => projectsQuery.refetch()} />
      ) : (
        <TodosPanel projects={projectOptions} />
      )}
    </PageContainer>
  );
}
