import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProblem,
  deleteProblem,
  fetchProblem,
  fetchProblemCandidates,
  fetchProblemEffectiveness,
  fetchProblems,
  linkChange,
  linkIncident,
  unlinkChange,
  unlinkIncident,
  updateProblem,
  type CreateProblemInput,
  type ProblemCandidatesQuery,
  type ProblemsQuery,
  type UpdateProblemInput,
} from "../api/problems.api";
import { queryKeys } from "./queryKeys";

// Phase 35 "Enterprise Problem Management & Root-Cause Intelligence" -
// bewusst OHNE eigenes refetchInterval: PROBLEM_UPDATED (Realtime) deckt
// alle mutierenden Problem-Aktionen ab (siehe hooks/useRealtime.ts), kein
// zusaetzliches Polling noetig - anders als Phase 34s useReliabilityProjects
// (dort loest reines SLO-CRUD bewusst KEIN Event aus).
export function useProblems(query: ProblemsQuery, enabled = true) {
  return useQuery({ queryKey: queryKeys.problems(query), queryFn: () => fetchProblems(query), enabled });
}

export function useProblem(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.problem(id ?? ""),
    queryFn: () => fetchProblem(id as string),
    enabled: Boolean(id),
  });
}

export function useProblemCandidates(query: ProblemCandidatesQuery, enabled = true) {
  return useQuery({ queryKey: queryKeys.problemCandidates(query), queryFn: () => fetchProblemCandidates(query), enabled });
}

// Phase 36 "Enterprise Remediation & Change Effectiveness Intelligence" -
// rein lesend, kein refetchInterval noetig: bestehende Incident-/Change-/
// SLO-Realtime-Events invalidieren bereits den ["problems"]-Praefix (siehe
// hooks/useRealtime.ts#invalidateProblemsQueries), unter dem diese Query-Keys
// liegen.
export function useProblemEffectiveness(id: string | undefined, windowDays: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.problemEffectiveness(id ?? "", windowDays),
    queryFn: () => fetchProblemEffectiveness(id as string, windowDays),
    enabled: Boolean(id) && enabled,
  });
}

export function useCreateProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProblemInput) => createProblem(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["problems"] });
    },
  });
}

export function useUpdateProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProblemInput }) => updateProblem(id, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.problem(variables.id) });
      void queryClient.invalidateQueries({ queryKey: ["problems"] });
    },
  });
}

export function useDeleteProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProblem(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["problems"] });
    },
  });
}

function invalidateProblem(queryClient: ReturnType<typeof useQueryClient>, problemId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.problem(problemId) });
  void queryClient.invalidateQueries({ queryKey: ["problems"] });
}

export function useLinkIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ problemId, incidentId }: { problemId: string; incidentId: string }) => linkIncident(problemId, incidentId),
    onSuccess: (_data, variables) => invalidateProblem(queryClient, variables.problemId),
  });
}

export function useUnlinkIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ problemId, incidentId }: { problemId: string; incidentId: string }) => unlinkIncident(problemId, incidentId),
    onSuccess: (_data, variables) => invalidateProblem(queryClient, variables.problemId),
  });
}

export function useLinkChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ problemId, changeId }: { problemId: string; changeId: string }) => linkChange(problemId, changeId),
    onSuccess: (_data, variables) => invalidateProblem(queryClient, variables.problemId),
  });
}

export function useUnlinkChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ problemId, changeId }: { problemId: string; changeId: string }) => unlinkChange(problemId, changeId),
    onSuccess: (_data, variables) => invalidateProblem(queryClient, variables.problemId),
  });
}
