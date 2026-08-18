import Stack from "@mui/material/Stack";
import { AlertRuleCard } from "./AlertRuleCard";
import { EmptyState } from "../common/EmptyState";
import type { AlertRule } from "../../types/alert.types";

interface AlertRuleListProps {
  rules: AlertRule[];
  projectNames: Record<string, string>;
}

export function AlertRuleList({ rules, projectNames }: AlertRuleListProps) {
  if (rules.length === 0) {
    return <EmptyState message="No alert rules yet." minHeight={200} />;
  }

  return (
    <Stack sx={{ gap: 2 }}>
      {rules.map((rule) => (
        <AlertRuleCard key={rule.id} rule={rule} projectName={projectNames[rule.projectId] ?? rule.projectId} />
      ))}
    </Stack>
  );
}
