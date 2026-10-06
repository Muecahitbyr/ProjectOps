// "Projekte" (eigene Sidebar-Seite, Nutzerwunsch 2026-10-06): strukturierter
// Ablageort fuer Admin-Zugangsdaten und Notizen je eigenem Kundenprojekt
// (z.B. eine fuer eine Firma gebaute Website). Ersetzt den bisherigen
// "Todos"-Nav-Eintrag - TodosPanel.tsx wird auf dieser Seite weiterverwendet,
// Name hier ist zugleich der Matching-Schluessel gegen todos.category.
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
  adminLoginUrl?: string | null;
  adminLoginUsername?: string | null;
  adminLoginPassword?: string | null;
  notes?: string | null;
}

export interface UpdateClientProjectInput {
  name?: string;
  adminLoginUrl?: string | null;
  adminLoginUsername?: string | null;
  adminLoginPassword?: string | null;
  notes?: string | null;
}
