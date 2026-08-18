import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDependency,
  createService,
  deleteDependency,
  deleteService,
  fetchService,
  fetchServiceDependencies,
  fetchServiceDependents,
  fetchServiceHealth,
  fetchServiceImpact,
  fetchServiceCriticalPath,
  fetchServices,
  fetchServicePortfolio,
  fetchTopology,
  updateService,
  type CreateDependencyInput,
  type CreateServiceInput,
  type ServicesQuery,
  type UpdateServiceInput,
} from "../api/services.api";
import { queryKeys } from "./queryKeys";

const SERVICE_REFRESH_MS = 30_000;

export function useServices(query: ServicesQuery = {}) {
  return useQuery({ queryKey: queryKeys.services(query), queryFn: () => fetchServices(query), refetchInterval: SERVICE_REFRESH_MS });
}

// Phase 48 "Enterprise Service Portfolio & Strategic Lifecycle Intelligence".
export function useServicePortfolio(organizationId: string, range: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.servicePortfolio(organizationId, range),
    queryFn: () => fetchServicePortfolio(organizationId, range),
    enabled: enabled && organizationId.length > 0,
  });
}

export function useService(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.service(id ?? ""), queryFn: () => fetchService(id as string), enabled: Boolean(id) });
}

export function useServiceHealth(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.serviceHealth(id ?? ""),
    queryFn: () => fetchServiceHealth(id as string),
    enabled: Boolean(id),
    refetchInterval: SERVICE_REFRESH_MS,
  });
}

export function useServiceDependencies(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.serviceDependencies(id ?? ""), queryFn: () => fetchServiceDependencies(id as string), enabled: Boolean(id) });
}

export function useServiceDependents(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.serviceDependents(id ?? ""), queryFn: () => fetchServiceDependents(id as string), enabled: Boolean(id) });
}

export function useServiceImpact(id: string | undefined, fresh = false) {
  return useQuery({
    queryKey: queryKeys.serviceImpact(id ?? ""),
    queryFn: () => fetchServiceImpact(id as string, fresh),
    enabled: Boolean(id),
    refetchInterval: SERVICE_REFRESH_MS,
  });
}

// Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis".
export function useServiceCriticalPath(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.serviceCriticalPath(id ?? ""),
    queryFn: () => fetchServiceCriticalPath(id as string),
    enabled: Boolean(id),
    refetchInterval: SERVICE_REFRESH_MS,
  });
}

export function useTopology(organizationId: string | undefined, teamId?: string) {
  return useQuery({
    queryKey: queryKeys.topology(organizationId ?? "", teamId),
    queryFn: () => fetchTopology(organizationId as string, teamId),
    enabled: Boolean(organizationId),
    refetchInterval: SERVICE_REFRESH_MS,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceInput) => createService(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "topology"] });
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateServiceInput }) => updateService(id, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.service(variables.id) });
      void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "topology"] });
    },
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteService(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "topology"] });
    },
  });
}

export function useCreateDependency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, input }: { serviceId: string; input: CreateDependencyInput }) => createDependency(serviceId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.serviceDependencies(variables.serviceId) });
      void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "topology"] });
      // Phase 25 - eine geaenderte Dependency kann den Blast-Radius/Critical
      // Path JEDES Services in der Organisation veraendern (server-seitig
      // ohnehin per invalidateImpactAnalysisCache() global geleert) - die
      // eigene Service-Detailseite ist der Regelfall, den ein Nutzer direkt
      // danach sieht, daher gezielt hier invalidiert statt auf den naechsten
      // 30s-Poll zu warten.
      void queryClient.invalidateQueries({ queryKey: ["platform", "services", "detail"] });
    },
  });
}

export function useDeleteDependency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, dependencyId }: { serviceId: string; dependencyId: string }) => deleteDependency(serviceId, dependencyId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.serviceDependencies(variables.serviceId) });
      void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "topology"] });
      // Phase 25 - eine geaenderte Dependency kann den Blast-Radius/Critical
      // Path JEDES Services in der Organisation veraendern (server-seitig
      // ohnehin per invalidateImpactAnalysisCache() global geleert) - die
      // eigene Service-Detailseite ist der Regelfall, den ein Nutzer direkt
      // danach sieht, daher gezielt hier invalidiert statt auf den naechsten
      // 30s-Poll zu warten.
      void queryClient.invalidateQueries({ queryKey: ["platform", "services", "detail"] });
    },
  });
}
