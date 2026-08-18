import { useState } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { PageContainer } from "../components/layout/PageContainer";
import { AnalyticsTabs } from "../components/analytics/AnalyticsTabs";
import { ProjectComparisonPanel } from "../components/analytics/ProjectComparisonPanel";
import { EmptyState } from "../components/common/EmptyState";
import { useProjectsHealth } from "../hooks/useProjects";

const HOURS_OPTIONS = [
  { value: 24 * 7, label: "Last 7d" },
  { value: 24 * 30, label: "Last 30d" },
  { value: 24 * 90, label: "Last 90d" },
];

// Auftragspunkt 6 ("Projektvergleich", eigene Route /analytics/compare).
export function Compare() {
  const projectsQuery = useProjectsHealth();
  const [projectAId, setProjectAId] = useState("");
  const [projectBId, setProjectBId] = useState("");
  const [hours, setHours] = useState(24 * 30);

  const projects = projectsQuery.data ?? [];

  return (
    <PageContainer title="Compare Projects">
      <AnalyticsTabs />

      <Stack direction="row" sx={{ gap: 2, mb: 3, flexWrap: "wrap" }}>
        <TextField select label="Project A" size="small" value={projectAId} onChange={(event) => setProjectAId(event.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">Select a project</MenuItem>
          {projects.map((project) => (
            <MenuItem key={project.id} value={project.id} disabled={project.id === projectBId}>
              {project.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Project B" size="small" value={projectBId} onChange={(event) => setProjectBId(event.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">Select a project</MenuItem>
          {projects.map((project) => (
            <MenuItem key={project.id} value={project.id} disabled={project.id === projectAId}>
              {project.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Period" size="small" value={hours} onChange={(event) => setHours(Number(event.target.value))} sx={{ minWidth: 160 }}>
          {HOURS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {projectAId && projectBId ? (
        <ProjectComparisonPanel projectAId={projectAId} projectBId={projectBId} hours={hours} />
      ) : (
        <EmptyState message="Select two projects to compare." minHeight={240} />
      )}
    </PageContainer>
  );
}
