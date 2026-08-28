export interface Todo {
  id: number;
  category: string | null;
  title: string;
  description: string | null;
  done: boolean;
  dueDate: string | null;
  needsTesting: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoInput {
  category?: string | null;
  title: string;
  description?: string | null;
  dueDate?: string | null;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string | null;
  done?: boolean;
  dueDate?: string | null;
  needsTesting?: boolean;
}
