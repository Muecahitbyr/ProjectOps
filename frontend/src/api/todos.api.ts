import { apiClient } from "./client";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "../types/todo.types";

export async function fetchTodos(projectId?: string): Promise<Todo[]> {
  const { data } = await apiClient.get<Todo[]>("/api/todos", {
    params: projectId ? { projectId } : undefined,
  });
  return data;
}

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  const { data } = await apiClient.post<Todo>("/api/todos", input);
  return data;
}

export async function updateTodo(id: number, input: UpdateTodoInput): Promise<Todo> {
  const { data } = await apiClient.patch<Todo>(`/api/todos/${id}`, input);
  return data;
}

export async function deleteTodo(id: number): Promise<void> {
  await apiClient.delete(`/api/todos/${id}`);
}
