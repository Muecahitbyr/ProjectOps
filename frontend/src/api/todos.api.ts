import { apiClient } from "./client";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "../types/todo.types";

export async function fetchTodos(category?: string): Promise<Todo[]> {
  const { data } = await apiClient.get<Todo[]>("/api/todos", {
    params: category ? { category } : undefined,
  });
  return data;
}

export async function fetchTodoCategories(): Promise<string[]> {
  const { data } = await apiClient.get<string[]>("/api/todos/categories");
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

export async function moveTodo(id: number, direction: "up" | "down"): Promise<Todo[]> {
  const { data } = await apiClient.post<Todo[]>(`/api/todos/${id}/move`, { direction });
  return data;
}

export async function deleteTodo(id: number): Promise<void> {
  await apiClient.delete(`/api/todos/${id}`);
}
