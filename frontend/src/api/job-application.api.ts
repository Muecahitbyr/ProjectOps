import { apiClient } from "./client";
import type { CreateJobApplicationInput, JobApplication, UpdateJobApplicationInput } from "../types/job-application.types";

export async function fetchJobApplications(): Promise<JobApplication[]> {
  const { data } = await apiClient.get<JobApplication[]>("/api/job-applications");
  return data;
}

export async function createJobApplication(input: CreateJobApplicationInput): Promise<JobApplication> {
  const { data } = await apiClient.post<JobApplication>("/api/job-applications", input);
  return data;
}

export async function updateJobApplication(id: number, input: UpdateJobApplicationInput): Promise<JobApplication> {
  const { data } = await apiClient.patch<JobApplication>(`/api/job-applications/${id}`, input);
  return data;
}

export async function deleteJobApplication(id: number): Promise<void> {
  await apiClient.delete(`/api/job-applications/${id}`);
}
