import { apiClient } from "./client";
import type { CreateCustomerFinderJobInput, CustomerFinderJob, CustomerFinderResult } from "../types/customer-finder.types";

export async function fetchCustomerFinderJobs(): Promise<CustomerFinderJob[]> {
  const { data } = await apiClient.get<CustomerFinderJob[]>("/api/customer-finder/jobs");
  return data;
}

export async function createCustomerFinderJob(input: CreateCustomerFinderJobInput): Promise<CustomerFinderJob> {
  const { data } = await apiClient.post<CustomerFinderJob>("/api/customer-finder/jobs", input);
  return data;
}

export async function fetchCustomerFinderResults(): Promise<CustomerFinderResult[]> {
  const { data } = await apiClient.get<CustomerFinderResult[]>("/api/customer-finder/results");
  return data;
}

export async function acceptCustomerFinderResult(id: number): Promise<void> {
  await apiClient.post(`/api/customer-finder/results/${id}/accept`);
}

export async function rejectCustomerFinderResult(id: number): Promise<void> {
  await apiClient.delete(`/api/customer-finder/results/${id}`);
}
