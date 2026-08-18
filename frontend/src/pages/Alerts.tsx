import { useMemo, useState } from "react";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import AddAlertOutlinedIcon from "@mui/icons-material/AddAlertOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { ActiveMaintenanceBanner } from "../components/maintenance/ActiveMaintenanceBanner";
import { AlertsTabs } from "../components/alerts/AlertsTabs";
import { AlertRuleList } from "../components/alerts/AlertRuleList";
import { AlertRuleForm } from "../components/alerts/AlertRuleForm";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { useAlertRules } from "../hooks/useAlerts";
import { useProjectsHealth } from "../hooks/useProjects";
import { useAuth } from "../auth/AuthContext";
import { getErrorMessage } from "../utils/getErrorMessage";

export function Alerts() {
  const [projectFilter, setProjectFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const projectsQuery = useProjectsHealth();
  const alertsQuery = useAlertRules(projectFilter || undefined);
  const { isGlobalAdmin } = useAuth();

  const projectNames = useMemo(
    () => Object.fromEntries((projectsQuery.data ?? []).map((project) => [project.id, project.name])),
    [projectsQuery.data],
  );

  return (
    <PageContainer title="Alerts">
      <ActiveMaintenanceBanner />
      <AlertsTabs />
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 3, gap: 2 }}>
        <TextField
          select
          label="Project"
          size="small"
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All projects</MenuItem>
          {(projectsQuery.data ?? []).map((project) => (
            <MenuItem key={project.id} value={project.id}>
              {project.name}
            </MenuItem>
          ))}
        </TextField>

        {isGlobalAdmin && (
          <Button variant="contained" startIcon={<AddAlertOutlinedIcon />} onClick={() => setDialogOpen(true)}>
            New rule
          </Button>
        )}
      </Stack>

      {alertsQuery.isLoading ? (
        <LoadingState label="Loading alert rules..." minHeight={300} />
      ) : alertsQuery.isError ? (
        <ErrorState message={getErrorMessage(alertsQuery.error)} onRetry={() => alertsQuery.refetch()} />
      ) : (
        <AlertRuleList rules={alertsQuery.data ?? []} projectNames={projectNames} />
      )}

      <AlertRuleForm
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        {...(projectFilter ? { defaultProjectId: projectFilter } : {})}
      />
    </PageContainer>
  );
}
