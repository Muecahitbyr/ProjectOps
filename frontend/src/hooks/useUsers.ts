import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, fetchRoles, fetchUser, fetchUsers, type CreateUserInput } from "../api/users.api";
import { queryKeys } from "./queryKeys";
import { REFRESH_INTERVAL_USERS_MS } from "../utils/constants";

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: fetchUsers,
    refetchInterval: REFRESH_INTERVAL_USERS_MS,
  });
}

export function useUser(userId: string) {
  return useQuery({
    queryKey: queryKeys.user(userId),
    queryFn: () => fetchUser(userId),
    refetchInterval: REFRESH_INTERVAL_USERS_MS,
    enabled: userId.length > 0,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: queryKeys.roles,
    queryFn: fetchRoles,
    staleTime: Infinity,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}
