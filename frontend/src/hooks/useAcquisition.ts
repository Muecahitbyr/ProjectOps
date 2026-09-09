import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAcquisitionCompany,
  deleteAcquisitionCompany,
  fetchAcquisitionCompanies,
  updateAcquisitionCompany,
} from "../api/acquisition.api";
import { queryKeys } from "./queryKeys";
import type { CreateAcquisitionCompanyInput, UpdateAcquisitionCompanyInput } from "../types/acquisition.types";

export function useAcquisitionCompanies() {
  return useQuery({
    queryKey: queryKeys.acquisitionCompanies,
    queryFn: fetchAcquisitionCompanies,
  });
}

export function useCreateAcquisitionCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAcquisitionCompanyInput) => createAcquisitionCompany(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["acquisition-companies"] });
    },
  });
}

export function useUpdateAcquisitionCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateAcquisitionCompanyInput }) => updateAcquisitionCompany(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["acquisition-companies"] });
    },
  });
}

export function useDeleteAcquisitionCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAcquisitionCompany(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["acquisition-companies"] });
    },
  });
}
