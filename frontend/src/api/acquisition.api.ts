import { apiClient } from "./client";
import type {
  AcquisitionCompany,
  AcquisitionContactAttempt,
  CreateAcquisitionCompanyInput,
  CreateContactAttemptInput,
  UpdateAcquisitionCompanyInput,
} from "../types/acquisition.types";

export async function fetchAcquisitionCompanies(): Promise<AcquisitionCompany[]> {
  const { data } = await apiClient.get<AcquisitionCompany[]>("/api/acquisition-companies");
  return data;
}

export async function createAcquisitionCompany(input: CreateAcquisitionCompanyInput): Promise<AcquisitionCompany> {
  const { data } = await apiClient.post<AcquisitionCompany>("/api/acquisition-companies", input);
  return data;
}

export async function updateAcquisitionCompany(id: number, input: UpdateAcquisitionCompanyInput): Promise<AcquisitionCompany> {
  const { data } = await apiClient.patch<AcquisitionCompany>(`/api/acquisition-companies/${id}`, input);
  return data;
}

export async function deleteAcquisitionCompany(id: number): Promise<void> {
  await apiClient.delete(`/api/acquisition-companies/${id}`);
}

export async function fetchContactAttempts(companyId: number): Promise<AcquisitionContactAttempt[]> {
  const { data } = await apiClient.get<AcquisitionContactAttempt[]>(`/api/acquisition-companies/${companyId}/contact-attempts`);
  return data;
}

export async function createContactAttempt(companyId: number, input: CreateContactAttemptInput): Promise<AcquisitionContactAttempt> {
  const { data } = await apiClient.post<AcquisitionContactAttempt>(`/api/acquisition-companies/${companyId}/contact-attempts`, input);
  return data;
}
