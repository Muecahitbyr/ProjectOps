import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createNisanGuest, deleteNisanGuest, fetchNisanGuests, updateNisanGuest } from "../api/nisan.api";
import { queryKeys } from "./queryKeys";
import type { CreateNisanGuestInput, UpdateNisanGuestInput } from "../types/nisan.types";

export function useNisanGuests() {
  return useQuery({
    queryKey: queryKeys.nisanGuests,
    queryFn: fetchNisanGuests,
  });
}

export function useCreateNisanGuest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNisanGuestInput) => createNisanGuest(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["nisan-guests"] });
    },
  });
}

export function useUpdateNisanGuest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateNisanGuestInput }) => updateNisanGuest(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["nisan-guests"] });
    },
  });
}

export function useDeleteNisanGuest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteNisanGuest(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["nisan-guests"] });
    },
  });
}
