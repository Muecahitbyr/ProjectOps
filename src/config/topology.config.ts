// Phase 23 Auftragspunkt 24 "Performance" - begrenzt jede rekursive
// Graph-Traversierung (Impact-Analyse, Health-Aggregation, Zyklus-Erkennung,
// core/topology.ts). Eigene, dokumentierte Annahme (keine externe Vorgabe) -
// 5 Ebenen decken jede realistische Abhaengigkeitstiefe in dieser
// Anwendung ab (aktuell max. 4 Projekte/Services insgesamt), verhindert
// aber strukturell unbegrenzte Rekursion bei zukuenftigem Wachstum oder
// einem uebersehenen Zyklus.
export const MAX_TOPOLOGY_DEPTH = 5;

// Obergrenze fuer die Anzahl gleichzeitig zurueckgegebener Knoten/Kanten in
// einer einzelnen Graph-Antwort (GET /platform/topology) - schuetzt vor
// einer versehentlich riesigen Antwort, ohne die Tiefenbegrenzung oben zu
// ersetzen (beides zusammen begrenzt sowohl "wie tief" als auch "wie breit").
export const MAX_TOPOLOGY_NODES = 500;
