// Fester Ablauf (Nutzerwunsch, nicht konfigurierbar):
// 1. Webseite bauen, 2. Anrufen, dann Ja/Nein "Interesse an einer
// Webseite?". "Nein" ist ein Endzustand (NO_WEBSITE). "Ja" ist KEIN
// Endzustand: 3. Webseite schicken, dann eine ZWEITE, unabhaengige Ja/Nein-
// Entscheidung "Webseite nach Ansicht gewuenscht?" - auch hier ist "Nein"
// ein Endzustand (dieselbe NO_WEBSITE-Liste). Erst danach 4. Planung,
// 5. Umsetzung, 6. Live/Fertig.
export type AcquisitionStage =
  | "WEBSITE_BUILDING"
  | "CALLING"
  | "DECISION_PENDING"
  | "NO_WEBSITE"
  | "SENDING_WEBSITE"
  | "CONFIRMATION_PENDING"
  | "PLANNING"
  | "IMPLEMENTATION"
  | "LIVE_PENDING"
  | "DONE";

export interface AcquisitionCompany {
  id: number;
  name: string;
  websiteBuilt: boolean;
  called: boolean;
  wantsWebsite: boolean | null;
  websiteSent: boolean;
  confirmedAfterViewing: boolean | null;
  planningDone: boolean;
  implementationDone: boolean;
  live: boolean;
  // Abgeleitet, nicht gespeichert - siehe acquisition.repository.ts.
  stage: AcquisitionStage;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAcquisitionCompanyInput {
  name: string;
}

export interface UpdateAcquisitionCompanyInput {
  name?: string | undefined;
  websiteBuilt?: boolean | undefined;
  called?: boolean | undefined;
  wantsWebsite?: boolean | null | undefined;
  websiteSent?: boolean | undefined;
  confirmedAfterViewing?: boolean | null | undefined;
  planningDone?: boolean | undefined;
  implementationDone?: boolean | undefined;
  live?: boolean | undefined;
}
