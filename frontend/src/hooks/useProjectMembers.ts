import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addProjectMember, fetchProjectMembers, removeProjectMember } from "../api/members.api";
import { queryKeys } from "./queryKeys";
import type { RoleId } from "../types/user.types";

export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => fetchProjectMembers(projectId),
    enabled: projectId.length > 0,
  });
}

export function useAddProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: RoleId }) => addProjectMember(projectId, userId, roleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useRemoveProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeProjectMember(projectId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}
