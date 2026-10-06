// "Projekte" (eigene Sidebar-Seite, Nutzerwunsch 2026-10-06): strukturierter
// Ablageort fuer Admin-Zugangsdaten und Notizen je eigenem Kundenprojekt
// (z.B. eine fuer eine Firma gebaute Website). Ersetzt den bisherigen
// "Todos"-Nav-Eintrag - TodosPanel.tsx wird auf dieser Seite weiterverwendet
// (siehe frontend/src/pages/ClientProjects.tsx), Name hier ist zugleich der
// Matching-Schluessel gegen todos.category.
export interface ClientProject {
  id: number;
  name: string;
  adminLoginUrl: string | null;
  adminLoginUsername: string | null;
  adminLoginPassword: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClientProjectInput {
  name: string;
  adminLoginUrl?: string | null | undefined;
  adminLoginUsername?: string | null | undefined;
  adminLoginPassword?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface UpdateClientProjectInput {
  name?: string | undefined;
  adminLoginUrl?: string | null | undefined;
  adminLoginUsername?: string | null | undefined;
  adminLoginPassword?: string | null | undefined;
  notes?: string | null | undefined;
}
