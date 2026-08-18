import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applyAutomationTemplate, fetchAutomationTemplates } from "../api/automation-templates.api";
import { queryKeys } from "./queryKeys";

export function useAutomationTemplates() {
  return useQuery({
    queryKey: queryKeys.automationTemplates,
    queryFn: fetchAutomationTemplates,
    staleTime: Infinity,
  });
}

export function useApplyAutomationTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, projectId }: { templateId: string; projectId: string }) =>
      applyAutomationTemplate(templateId, projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
    },
  });
}
