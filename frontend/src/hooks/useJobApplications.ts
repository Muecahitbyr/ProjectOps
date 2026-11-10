import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createJobApplication, deleteJobApplication, fetchJobApplications, updateJobApplication } from "../api/job-application.api";
import { queryKeys } from "./queryKeys";
import type { CreateJobApplicationInput, UpdateJobApplicationInput } from "../types/job-application.types";

export function useJobApplications() {
  return useQuery({
    queryKey: queryKeys.jobApplications,
    queryFn: fetchJobApplications,
  });
}

export function useCreateJobApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJobApplicationInput) => createJobApplication(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobApplications });
    },
  });
}

export function useUpdateJobApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateJobApplicationInput }) => updateJobApplication(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobApplications });
    },
  });
}

export function useDeleteJobApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteJobApplication(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobApplications });
    },
  });
}
