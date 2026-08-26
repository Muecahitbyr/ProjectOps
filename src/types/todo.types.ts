export interface Todo {
  id: number;
  projectId: string | null;
  title: string;
  description: string | null;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoInput {
  projectId?: string | null | undefined;
  title: string;
  description?: string | null | undefined;
}

export interface UpdateTodoInput {
  title?: string | undefined;
  description?: string | null | undefined;
  done?: boolean | undefined;
}
