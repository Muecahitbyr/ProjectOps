// Fester Ablauf (Nutzerwunsch, nicht konfigurierbar): 1. Webseite bauen,
// 2. Anrufen, dann eine Ja/Nein-Entscheidung "moechte eine Webseite". "Nein"
// ist ein Endzustand (NO_WEBSITE). "Ja" ist KEIN Endzustand - die Firma
// bleibt in Bearbeitung und durchlaeuft noch 3. Planung, 4. Umsetzung,
// 5. Live/Fertig.
export type AcquisitionStage =
  | "WEBSITE_BUILDING"
  | "CALLING"
  | "DECISION_PENDING"
  | "NO_WEBSITE"
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
  planningDone: boolean;
  implementationDone: boolean;
  live: boolean;
  // Abgeleitet, nicht gespeichert - siehe Backend acquisition.repository.ts.
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
  planningDone?: boolean | undefined;
  implementationDone?: boolean | undefined;
  live?: boolean | undefined;
}
