import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTodo, deleteTodo, fetchTodoCategories, fetchTodos, reorderTodos, updateTodo } from "../api/todos.api";
import { queryKeys } from "./queryKeys";
import type { CreateTodoInput, UpdateTodoInput } from "../types/todo.types";

export function useTodos(category?: string) {
  return useQuery({
    queryKey: queryKeys.todos(category),
    queryFn: () => fetchTodos(category),
  });
}

export function useTodoCategories() {
  return useQuery({
    queryKey: queryKeys.todoCategories,
    queryFn: fetchTodoCategories,
  });
}

export function useCreateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTodoInput) => createTodo(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}

export function useUpdateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateTodoInput }) => updateTodo(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}

export function useReorderTodos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ category, orderedIds }: { category: string | null; orderedIds: number[] }) => reorderTodos(category, orderedIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}

export function useDeleteTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTodo(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}
