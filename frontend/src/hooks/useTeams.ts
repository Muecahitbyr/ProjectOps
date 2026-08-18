import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addProjectToTeam,
  addTeamMember,
  createTeam,
  deleteTeam,
  fetchTeamMembers,
  fetchTeamNotificationSettings,
  fetchTeamProjects,
  fetchTeams,
  removeProjectFromTeam,
  removeTeamMember,
  upsertTeamNotificationSetting,
} from "../api/teams.api";
import { queryKeys } from "./queryKeys";
import type { OrganizationRoleId } from "../types/organization.types";

export function useTeams(organizationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.teams(organizationId ?? ""),
    queryFn: () => fetchTeams(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useTeamMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.teamMembers(teamId ?? ""),
    queryFn: () => fetchTeamMembers(teamId!),
    enabled: Boolean(teamId),
  });
}

export function useTeamProjects(teamId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.teamProjects(teamId ?? ""),
    queryFn: () => fetchTeamProjects(teamId!),
    enabled: Boolean(teamId),
  });
}

export function useTeamNotificationSettings(teamId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.teamNotificationSettings(teamId ?? ""),
    queryFn: () => fetchTeamNotificationSettings(teamId!),
    enabled: Boolean(teamId),
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, name, description }: { organizationId: string; name: string; description?: string }) =>
      createTeam(organizationId, name, description),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.teams(variables.organizationId) });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}

export function useAddTeamMember(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: OrganizationRoleId }) => addTeamMember(teamId, userId, roleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers(teamId) });
    },
  });
}

export function useRemoveTeamMember(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeTeamMember(teamId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers(teamId) });
    },
  });
}

export function useAddProjectToTeam(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => addProjectToTeam(teamId, projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.teamProjects(teamId) });
    },
  });
}

export function useRemoveProjectFromTeam(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => removeProjectFromTeam(teamId, projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.teamProjects(teamId) });
    },
  });
}

export function useUpsertTeamNotificationSetting(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, enabled }: { channelId: string; enabled: boolean }) => upsertTeamNotificationSetting(teamId, channelId, enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.teamNotificationSettings(teamId) });
    },
  });
}
