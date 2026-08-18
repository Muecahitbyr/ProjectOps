import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import { useNavigate } from "react-router-dom";
import type { ProjectHealthSummary } from "../../types/dashboard.types";
import { StatusBadge } from "../common/StatusBadge";
import { healthStatusColors } from "../../theme/statusColors";

interface ProjectStatusCardProps {
  project: ProjectHealthSummary;
}

interface CheckCountProps {
  label: string;
  count: number;
  color: string;
}

function CheckCount({ label, count, color }: CheckCountProps) {
  return (
    <Box sx={{ textAlign: "center", minWidth: 48 }}>
      <Typography variant="h4" sx={{ color, fontVariantNumeric: "tabular-nums" }}>
        {count}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

export function ProjectStatusCard({ project }: ProjectStatusCardProps) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardActionArea onClick={() => navigate(`/projects/${project.id}`)}>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
            <Box>
              <Typography variant="h3">{project.name}</Typography>
              <Chip label={project.type} size="small" variant="outlined" sx={{ mt: 0.5 }} />
            </Box>
            <StatusBadge status={project.health.status} />
          </Stack>

          <Typography variant="body2" sx={{ mb: 2 }}>
            Health score: <strong>{project.health.score}</strong>/100
          </Typography>

          <Stack direction="row" spacing={2} sx={{ mb: project.openIncidents > 0 ? 1.5 : 0 }}>
            <CheckCount label="online" count={project.checks.online} color={healthStatusColors.healthy} />
            <CheckCount label="warning" count={project.checks.warning} color={healthStatusColors.warning} />
            <CheckCount label="error" count={project.checks.error} color={healthStatusColors.critical} />
          </Stack>

          {project.openIncidents > 0 ? (
            <Typography variant="body2" sx={{ color: healthStatusColors.critical }}>
              {project.openIncidents} open incident{project.openIncidents === 1 ? "" : "s"}
            </Typography>
          ) : null}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
