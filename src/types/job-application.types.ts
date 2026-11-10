// "Bewerbungen" (eigene Sidebar-Seite, Nutzerwunsch 2026-11-11): Tracking der
// eigenen Job-Bewerbungen, Hauptzweck ist eine Suchfunktion vor einer neuen
// Bewerbung ("habe ich mich hier schon mal beworben?").
export type JobApplicationStatus = "OFFEN" | "ABSAGE" | "ZUSAGE";

export interface JobApplication {
  id: number;
  company: string;
  position: string | null;
  appliedAt: string | null;
  location: string | null;
  interviewNote: string | null;
  status: JobApplicationStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobApplicationInput {
  company: string;
  position?: string | null | undefined;
  appliedAt?: string | null | undefined;
  location?: string | null | undefined;
  interviewNote?: string | null | undefined;
  status?: JobApplicationStatus | undefined;
  notes?: string | null | undefined;
}

export interface UpdateJobApplicationInput {
  company?: string | undefined;
  position?: string | null | undefined;
  appliedAt?: string | null | undefined;
  location?: string | null | undefined;
  interviewNote?: string | null | undefined;
  status?: JobApplicationStatus | undefined;
  notes?: string | null | undefined;
}
