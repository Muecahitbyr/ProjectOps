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
  // Mini-CRM-Kontaktdaten (Nutzerwunsch 2026-09-16) - bei Uebernahme aus
  // "Kunden Finden" befuellt, sonst manuell nachtragbar. Alle optional, da
  // manuell angelegte Firmen sie zunaechst nicht haben.
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  category: string | null;
  address: string | null;
  // Rohes JSON vom Scraper - siehe customer-finder.types.ts ScrapedLead.
  openingHours: string | null;
  // Wiedervorlage - YYYY-MM-DD, DB-DATE-Spalte (analog todos.dueDate).
  nextContactAt: string | null;
  // Abgeleitet, nicht gespeichert - siehe acquisition.repository.ts.
  stage: AcquisitionStage;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAcquisitionCompanyInput {
  name: string;
  phone?: string | undefined;
  email?: string | undefined;
  websiteUrl?: string | undefined;
  category?: string | undefined;
  address?: string | undefined;
  openingHours?: string | undefined;
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
  phone?: string | null | undefined;
  email?: string | null | undefined;
  websiteUrl?: string | null | undefined;
  category?: string | null | undefined;
  address?: string | null | undefined;
  nextContactAt?: string | null | undefined;
}

export type ContactAttemptOutcome = "NOT_REACHED" | "SPOKE_TO_STAFF" | "SPOKE_TO_OWNER" | "CALLBACK_REQUESTED" | "OTHER";

export interface AcquisitionContactAttempt {
  id: number;
  companyId: number;
  outcome: ContactAttemptOutcome;
  note: string | null;
  createdAt: string;
}

export interface CreateContactAttemptInput {
  outcome: ContactAttemptOutcome;
  note?: string | undefined;
}
