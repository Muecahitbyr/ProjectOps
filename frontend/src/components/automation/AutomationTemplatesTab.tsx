import { useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { useApplyAutomationTemplate, useAutomationTemplates } from "../../hooks/useAutomationTemplates";
import { useProjectsHealth } from "../../hooks/useProjects";
import { useAuth } from "../../auth/AuthContext";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { healthStatusColors } from "../../theme/statusColors";
import type { AutomationTemplate } from "../../types/automation.types";

// Teil 5 "Automation Templates" - vorgefertigte Regeln, die per Klick auf
// ein Projekt angewendet werden (erzeugt eine echte automation_rules-Zeile,
// siehe backend automation-templates.routes.ts).
export function AutomationTemplatesTab() {
  const query = useAutomationTemplates();
  const [applyTarget, setApplyTarget] = useState<AutomationTemplate | null>(null);

  if (query.isLoading) {
    return <LoadingState label="Loading templates..." minHeight={200} />;
  }
  if (query.isError) {
    return <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} minHeight={200} />;
  }

  return (
    <>
      <Grid container spacing={2}>
        {(query.data ?? []).map((template) => (
          <Grid key={template.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="h4" sx={{ mb: 0.5 }}>
                  {template.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {template.description}
                </Typography>
                <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap" }}>
                  <Chip size="small" variant="outlined" label={template.trigger.replaceAll("_", " ")} />
                  <Chip size="small" variant="outlined" label={template.action.replaceAll("_", " ")} />
                  {template.autoExecute ? (
                    <Chip size="small" label="Auto" sx={{ backgroundColor: `${healthStatusColors.healthy}1f`, color: healthStatusColors.healthy }} />
                  ) : (
                    <Chip size="small" label="Needs approval" sx={{ backgroundColor: `${healthStatusColors.warning}1f`, color: healthStatusColors.warning }} />
                  )}
                </Stack>
              </CardContent>
              <CardActions>
                <Button size="small" onClick={() => setApplyTarget(template)}>
                  Apply to project...
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      <ApplyTemplateDialog template={applyTarget} onClose={() => setApplyTarget(null)} />
    </>
  );
}

function ApplyTemplateDialog({ template, onClose }: { template: AutomationTemplate | null; onClose: () => void }) {
  const [projectId, setProjectId] = useState("");
  const projectsQuery = useProjectsHealth();
  const applyMutation = useApplyAutomationTemplate();
  const { isGlobalAdmin } = useAuth();

  const handleClose = (): void => {
    setProjectId("");
    applyMutation.reset();
    onClose();
  };

  const handleApply = (): void => {
    if (!template) return;
    applyMutation.mutate({ templateId: template.id, projectId }, { onSuccess: handleClose });
  };

  return (
    <Dialog open={template !== null} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Apply "{template?.name}"</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, pt: 1 }}>
          {!isGlobalAdmin ? <Alert severity="warning">You need OWNER/ADMIN on a project to apply templates.</Alert> : null}
          {applyMutation.isError ? <Alert severity="error">{getErrorMessage(applyMutation.error)}</Alert> : null}
          <TextField select label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)} fullWidth autoFocus>
            {(projectsQuery.data ?? []).map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={applyMutation.isPending}>
          Cancel
        </Button>
        <Button onClick={handleApply} variant="contained" disabled={projectId.length === 0 || applyMutation.isPending}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
