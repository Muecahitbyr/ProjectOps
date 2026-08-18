import { useNavigate } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import ListItemButton from "@mui/material/ListItemButton";
import { EmptyState } from "../common/EmptyState";
import { healthStatusColors } from "../../theme/statusColors";
import { formatPercent } from "../../utils/formatters";
import type { RankedProject } from "../../types/analytics.types";

interface RankedProjectListProps {
  projects: RankedProject[];
  emptyMessage: string;
}

// Wird sowohl fuer "Top 10 kritischste Projekte" als auch "Top 10 stabilste
// Projekte" verwendet (Sortierung passiert bereits im Backend, siehe
// getTopAndStableProjects in analytics.repository.ts) - ein Klick springt
// zur bestehenden Projekt-Detailseite.
export function RankedProjectList({ projects, emptyMessage }: RankedProjectListProps) {
  const navigate = useNavigate();

  if (projects.length === 0) {
    return <EmptyState message={emptyMessage} minHeight={120} />;
  }

  return (
    <Stack sx={{ gap: 0.5 }}>
      {projects.map((project, index) => (
        <ListItemButton
          key={project.projectId}
          onClick={() => navigate(`/projects/${project.projectId}`)}
          sx={{ borderRadius: 1.5, px: 1.5, py: 1 }}
        >
          <Stack direction="row" sx={{ width: "100%", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ width: 18, flexShrink: 0 }}>
                {index + 1}
              </Typography>
              <Typography variant="body2" noWrap>
                {project.projectName}
              </Typography>
            </Stack>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexShrink: 0 }}>
              <Typography variant="caption" color="text.secondary">
                {formatPercent(project.availability)}
              </Typography>
              <Chip
                size="small"
                label={`${project.openIncidents} open`}
                sx={{
                  backgroundColor: project.openIncidents > 0 ? `${healthStatusColors.critical}1f` : undefined,
                  color: project.openIncidents > 0 ? healthStatusColors.critical : undefined,
                }}
              />
              <Chip size="small" label={`Score ${project.healthScore}`} variant="outlined" />
            </Stack>
          </Stack>
        </ListItemButton>
      ))}
    </Stack>
  );
}
