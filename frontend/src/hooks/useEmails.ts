import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchEmails, markEmailRead } from "../api/emails.api";
import { queryKeys } from "./queryKeys";

export function useEmails(limit = 50) {
  return useQuery({
    queryKey: queryKeys.emails(limit),
    queryFn: () => fetchEmails(limit),
  });
}

export function useMarkEmailRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, read }: { id: number; read: boolean }) => markEmailRead(id, read),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
  });
}
