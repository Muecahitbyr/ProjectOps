export interface Todo {
  id: number;
  // Freier Text statt Fremdschluessel auf projects(id) - deckt auch eigene
  // Vorhaben/Firmen ab, die kein ueberwachtes ProjectOps-Projekt sind (z.B.
  // "cmd Gebäudereinigung", "mehdi"), siehe Migration 0067.
  category: string | null;
  title: string;
  description: string | null;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoInput {
  category?: string | null | undefined;
  title: string;
  description?: string | null | undefined;
}

export interface UpdateTodoInput {
  title?: string | undefined;
  description?: string | null | undefined;
  done?: boolean | undefined;
}
