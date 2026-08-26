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
  projectId?: string | null;
  title: string;
  description?: string | null;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string | null;
  done?: boolean;
}
