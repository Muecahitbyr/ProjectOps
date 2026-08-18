import Grid from "@mui/material/Grid";
import { PageContainer } from "../components/layout/PageContainer";
import { ProjectStatusCard } from "../components/dashboard/ProjectStatusCard";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useProjectsHealth } from "../hooks/useProjects";
import { getErrorMessage } from "../utils/getErrorMessage";

export function Projects() {
  const { data, isLoading, isError, error, refetch } = useProjectsHealth();

  return (
    <PageContainer title="Projects">
      {isLoading ? (
        <LoadingState label="Loading projects..." minHeight={300} />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState message="No projects configured yet." />
      ) : (
        <Grid container spacing={3}>
          {data.map((project) => (
            <Grid key={project.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <ProjectStatusCard project={project} />
            </Grid>
          ))}
        </Grid>
      )}
    </PageContainer>
  );
}
