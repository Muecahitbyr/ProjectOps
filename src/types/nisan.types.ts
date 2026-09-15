// Nisan-Gaesteliste (Verlobung, eigene Sidebar-Seite, Nutzerwunsch): zwei
// feste Listen statt konfigurierbarer Gruppen.
export type NisanHost = "MUECAHIT" | "GOENUEL";

// CONFIRMED = "unbedingt/fix dabei", MAYBE = nur eingeladen/vielleicht.
// Default beim Anlegen ist MAYBE (siehe Migration 0073).
export type NisanGuestStatus = "CONFIRMED" | "MAYBE";

export interface NisanGuest {
  id: number;
  host: NisanHost;
  name: string;
  status: NisanGuestStatus;
  createdAt: string;
}

export interface CreateNisanGuestInput {
  host: NisanHost;
  name: string;
  status?: NisanGuestStatus | undefined;
}

export interface UpdateNisanGuestInput {
  status: NisanGuestStatus;
}
