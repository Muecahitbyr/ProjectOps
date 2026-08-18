import { apiClient } from "./client";
import type { Problem, ProblemCandidate, ProblemChangeLink, ProblemDetail, ProblemIncidentLink, ProblemListRow, ProblemPriority, ProblemStatus } from "../types/problem.types";
import type { ProblemEffectiveness } from "../types/remediation-effectiveness.types";

export interface ProblemStatusCounts {
  open: number;
  investigating: number;
  knownError: number;
  mitigated: number;
  resolved: number;
  closed: number;
  criticalCount: number;
}

export interface ProblemOverview {
  counts: ProblemStatusCounts;
  problems: ProblemListRow[];
}

export interface ProblemsQuery {
  organizationId: string;
  status?: ProblemStatus;
  priority?: ProblemPriority;
  ownerUserId?: string;
}

export async function fetchProblems(query: ProblemsQuery): Promise<ProblemOverview> {
  const { data } = await apiClient.get<ProblemOverview>("/api/problems", { params: query });
  return data;
}

export async function fetchProblem(id: string): Promise<ProblemDetail> {
  const { data } = await apiClient.get<ProblemDetail>(`/api/problems/${id}`);
  return data;
}

export interface ProblemCandidatesQuery {
  organizationId: string;
  hours?: number;
  minCount?: number;
}

export async function fetchProblemCandidates(query: ProblemCandidatesQuery): Promise<ProblemCandidate[]> {
  const { data } = await apiClient.get<ProblemCandidate[]>("/api/problems/candidates", { params: query });
  return data;
}

export interface CreateProblemInput {
  organizationId: string;
  title: string;
  description?: string;
  status?: ProblemStatus;
  priority?: ProblemPriority;
  ownerUserId?: string;
  rootCause?: string;
  workaround?: string;
  remediation?: string;
}

export async function createProblem(input: CreateProblemInput): Promise<Problem> {
  const { data } = await apiClient.post<Problem>("/api/problems", input);
  return data;
}

export interface UpdateProblemInput {
  title?: string;
  description?: string | null;
  status?: ProblemStatus;
  priority?: ProblemPriority;
  ownerUserId?: string | null;
  rootCause?: string | null;
  workaround?: string | null;
  remediation?: string | null;
}

export async function updateProblem(id: string, input: UpdateProblemInput): Promise<Problem> {
  const { data } = await apiClient.patch<Problem>(`/api/problems/${id}`, input);
  return data;
}

export async function deleteProblem(id: string): Promise<void> {
  await apiClient.delete(`/api/problems/${id}`);
}

export async function linkIncident(problemId: string, incidentId: string): Promise<ProblemIncidentLink | { alreadyLinked: true }> {
  const { data } = await apiClient.post(`/api/problems/${problemId}/incidents/${incidentId}`);
  return data;
}

export async function unlinkIncident(problemId: string, incidentId: string): Promise<void> {
  await apiClient.delete(`/api/problems/${problemId}/incidents/${incidentId}`);
}

export async function linkChange(problemId: string, changeId: string): Promise<ProblemChangeLink | { alreadyLinked: true }> {
  const { data } = await apiClient.post(`/api/problems/${problemId}/changes/${changeId}`);
  return data;
}

export async function unlinkChange(problemId: string, changeId: string): Promise<void> {
  await apiClient.delete(`/api/problems/${problemId}/changes/${changeId}`);
}

// Phase 36 "Enterprise Remediation & Change Effectiveness Intelligence" -
// rein lesend, keine Mutation (siehe Auftrag "POST/PATCH ist fuer die
// Analyse NICHT erforderlich").
export async function fetchProblemEffectiveness(problemId: string, windowDays: number): Promise<ProblemEffectiveness> {
  const { data } = await apiClient.get<ProblemEffectiveness>(`/api/problems/${problemId}/effectiveness`, { params: { windowDays } });
  return data;
}
