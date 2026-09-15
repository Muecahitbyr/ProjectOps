import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptCustomerFinderResult,
  createCustomerFinderJob,
  fetchCustomerFinderJobs,
  fetchCustomerFinderResults,
  rejectCustomerFinderResult,
} from "../api/customer-finder.api";
import { queryKeys } from "./queryKeys";
import type { CreateCustomerFinderJobInput } from "../types/customer-finder.types";

export function useCustomerFinderJobs() {
  return useQuery({
    queryKey: queryKeys.customerFinderJobs,
    queryFn: fetchCustomerFinderJobs,
  });
}

export function useCreateCustomerFinderJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerFinderJobInput) => createCustomerFinderJob(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customer-finder-jobs"] });
    },
  });
}

export function useCustomerFinderResults() {
  return useQuery({
    queryKey: queryKeys.customerFinderResults,
    queryFn: fetchCustomerFinderResults,
  });
}

export function useAcceptCustomerFinderResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => acceptCustomerFinderResult(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customer-finder-results"] });
      void queryClient.invalidateQueries({ queryKey: ["acquisition-companies"] });
    },
  });
}

export function useRejectCustomerFinderResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => rejectCustomerFinderResult(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customer-finder-results"] });
    },
  });
}
