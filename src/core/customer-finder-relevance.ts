import type { ScrapedLead } from "../types/customer-finder.types";

// Generischer Kategorie-Relevanz-Filter fuer "Kunden Finden" (Nutzerfeedback
// 2026-09-28: bei "Fahrschule Kaufbeuren" erschienen teilweise Friseure).
//
// Ursachenanalyse (siehe Abschlussbericht): der eigentliche Hauptgrund war,
// dass die Ergebnisliste bis dahin ALLE jemals gesuchten Treffer global
// zusammen anzeigte (customer_finder_results ohne Bezug zur aktuellen Suche)
// - behoben in customer-finder.routes.ts/CustomerFinder.tsx (Scoping nach
// Branche+Stadt). Live-Tests der Scraper-Rohdaten (Fast Mode, "Fahrschule/
// Friseur/Restaurant in Kaufbeuren") zeigten aber auch: die Google-Maps-
// Kategorie-Spalte ("category") ist im Fast Mode IMMER leer - eine
// nachtraegliche Kategorie-Pruefung anhand des `category`-Feldes ist also
// nicht moeglich, nur Name/Adresse/Website stehen zur Verfuegung. Dieser
// Filter ist daher ein zusaetzliches, bewusst KONSERVATIVES Sicherheitsnetz
// (nicht die Hauptursache-Behebung): er blockt nur Treffer, deren Name klar
// einer ANDEREN bekannten Branche zuzuordnen ist, und laesst alles andere
// (auch Treffer ganz ohne erkennbares Signal, z.B. reine Personennamen wie
// "Weis" oder "Helmut Folter" - beides echte Fahrschulen in den Live-Tests)
// bewusst durch, um keine echten Leads faelschlich zu verwerfen.
//
// Generisch fuer ALLE Branchen (nicht nur Fahrschule/Friseur) - siehe
// CATEGORY_SYNONYM_GROUPS unten, frei erweiterbar um weitere Branchen ohne
// Code-Aenderung an der Filterlogik selbst.
interface CategoryGroup {
  id: string;
  // Deutsche + englische Synonyme, jeweils als ganzes Wort/Phrase gematcht
  // (siehe containsWord()) - keine kurzen/generischen Einzelwoerter wie
  // "bar" oder "salon", die in Eigennamen zufaellig als Teilstring
  // vorkommen koennten (z.B. "Barnsteiner", "Autosalon").
  keywords: string[];
}

export const CATEGORY_SYNONYM_GROUPS: CategoryGroup[] = [
  { id: "drivingSchool", keywords: ["fahrschule", "fahrlehrer", "verkehrsschule", "driving school"] },
  {
    id: "hairSalon",
    keywords: ["friseur", "frisör", "frisor", "haarsalon", "hairstyling", "hair style", "hair salon", "coiffeur", "barbershop", "barbier"],
  },
  {
    id: "carRepair",
    keywords: ["autowerkstatt", "kfz-werkstatt", "kfz werkstatt", "kfz-meister", "autoservice", "car repair", "auto repair", "reifenservice"],
  },
  { id: "carDealer", keywords: ["autohaus", "autosalon", "gebrauchtwagenhändler", "gebrauchtwagenhaendler", "car dealer", "car dealership"] },
  {
    id: "restaurant",
    keywords: [
      "restaurant",
      "gasthof",
      "gasthaus",
      "gaststätte",
      "gaststaette",
      "pizzeria",
      "trattoria",
      "taverna",
      "bistro",
      "imbiss",
      "cafe",
      "café",
      "kneipe",
    ],
  },
  { id: "dentist", keywords: ["zahnarzt", "zahnarztpraxis", "dentist", "dental"] },
  { id: "lawyer", keywords: ["anwalt", "rechtsanwalt", "anwaltskanzlei", "lawyer", "law firm"] },
  { id: "realEstate", keywords: ["immobilienmakler", "immobilien", "real estate", "makler"] },
  { id: "gym", keywords: ["fitnessstudio", "fitness studio", "kraftsport", "crossfit", "gym"] },
  { id: "bakery", keywords: ["bäckerei", "baeckerei", "konditorei", "bakery"] },
  { id: "butcher", keywords: ["metzgerei", "metzger", "fleischerei", "butcher"] },
  { id: "hotel", keywords: ["hotel", "pension", "gästehaus", "gaestehaus", "hostel"] },
  { id: "pharmacy", keywords: ["apotheke", "pharmacy"] },
  { id: "physio", keywords: ["physiotherapie", "krankengymnastik", "physical therapy", "physiotherapy"] },
  { id: "nailStudio", keywords: ["nagelstudio", "nagelsalon", "nail studio", "nail salon"] },
  { id: "painter", keywords: ["malerbetrieb", "malermeister", "painter"] },
  { id: "electrician", keywords: ["elektriker", "elektrobetrieb", "electrician"] },
  { id: "plumbing", keywords: ["sanitärbetrieb", "sanitaerbetrieb", "heizungsbau", "klempner", "plumbing"] },
  { id: "roofer", keywords: ["dachdecker", "roofer", "roofing"] },
  { id: "taxAdvisor", keywords: ["steuerberater", "steuerberatung", "tax advisor"] },
  { id: "vet", keywords: ["tierarzt", "tierklinik", "veterinary", "vet clinic"] },
  { id: "optician", keywords: ["optiker", "optician"] },
  { id: "travelAgency", keywords: ["reisebüro", "reisebuero", "travel agency"] },
  { id: "insurance", keywords: ["versicherungsmakler", "versicherungsagentur", "insurance broker"] },
  { id: "furniture", keywords: ["möbelhaus", "moebelhaus", "furniture store"] },
  { id: "florist", keywords: ["blumenladen", "blumengeschäft", "blumengeschaeft", "florist"] },
  { id: "cosmetics", keywords: ["kosmetikstudio", "beauty studio", "cosmetics studio"] },
];

// Deutsche Umlaute/ß zaehlen als Wortzeichen fuer die Grenzpruefung - sonst
// wuerde z.B. "friseur" in "Frisörsalon" nicht als Wortgrenze erkannt (JS
// \b kennt nur ASCII-Wortzeichen).
const WORD_CHAR_CLASS = "a-zA-Z0-9äöüÄÖÜß";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Prueft, ob `keyword` als eigenstaendiges Wort ODER als Suffix eines
// deutschen Kompositums in `haystack` vorkommt. NUR die Wortgrenze NACH dem
// Keyword wird geprueft, die davor bewusst NICHT: deutsche Komposita haengen
// das Kernwort meist vorne an (z.B. "Landbäckerei", "Stadtapotheke") - ein
// Treffer wie "Landbäckerei IHLE Café" bei der Suche "Bäckerei" wurde live
// getestet faelschlich als branchenfremd verworfen, weil vor "bäckerei" das
// "d" aus "Land" stand (echter, live gefundener Bug, 2026-09-28). Die
// Grenze NACH dem Keyword bleibt aber Pflicht - das verhindert weiterhin
// Treffer wie "bar" in "Barnsteiner" (dort folgt "n", keine Wortgrenze).
function containsWord(haystack: string, keyword: string): boolean {
  const pattern = new RegExp(`${escapeRegExp(keyword)}([^${WORD_CHAR_CLASS}]|$)`, "i");
  return pattern.test(haystack);
}

function matchGroups(text: string): Set<string> {
  const matched = new Set<string>();
  for (const group of CATEGORY_SYNONYM_GROUPS) {
    if (group.keywords.some((keyword) => containsWord(text, keyword))) {
      matched.add(group.id);
    }
  }
  return matched;
}

export interface RelevanceCheckInput {
  searchKeywords: string;
  name: string;
  category: string | null;
  website: string | null;
}

// true = Treffer wird behalten. Ablehnung NUR wenn der Treffer erkennbar zu
// einer ANDEREN bekannten Branche gehoert als die gesuchte - bei fehlendem
// oder mehrdeutigem Signal wird bewusst NICHT abgelehnt (siehe Modul-Kommentar
// oben: lieber ein irrelevanter Treffer zu viel als ein echter Lead
// faelschlich verworfen).
export function isLikelyRelevant(input: RelevanceCheckInput): boolean {
  const searchGroups = matchGroups(input.searchKeywords);
  if (searchGroups.size === 0) return true; // unbekannte/individuelle Branche - kein Urteil moeglich

  const haystack = [input.name, input.category, input.website].filter((v): v is string => !!v).join(" ");
  const resultGroups = matchGroups(haystack);
  if (resultGroups.size === 0) return true; // kein Signal im Treffer selbst - nicht blockieren

  for (const group of resultGroups) {
    if (searchGroups.has(group)) return true; // Ueberschneidung -> passt zur gesuchten Branche
  }
  return false; // erkennbar eine andere Branche, kein Ueberschneidungssignal
}

export interface RelevanceFilterResult {
  relevant: ScrapedLead[];
  rejected: ScrapedLead[];
}

// Pipeline-Schritt "Kategorie/Relevanz pruefen" (siehe customer-finder.routes.ts) -
// nach Dedupe, vor dem Website-Filter (der bereits in extractLeadRows()
// passiert, siehe dortige Kommentare zur Reihenfolge).
export function filterRelevantLeads(searchKeywords: string, leads: ScrapedLead[]): RelevanceFilterResult {
  const relevant: ScrapedLead[] = [];
  const rejected: ScrapedLead[] = [];
  for (const lead of leads) {
    if (isLikelyRelevant({ searchKeywords, name: lead.name, category: lead.category, website: lead.website })) {
      relevant.push(lead);
    } else {
      rejected.push(lead);
    }
  }
  return { relevant, rejected };
}
