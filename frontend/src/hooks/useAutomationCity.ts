import { useAutomationRules } from "./useAutomationRules";
import { useAutomationActions } from "./useAutomationActions";
import { useAutomationExecutions } from "./useAutomationExecutions";
import { mapAutomationToCity } from "../utils/automationCityMapper";
import type { AutomationCityBuildingData } from "../types/automation-city.types";

export interface UseAutomationCityResult {
  buildings: AutomationCityBuildingData[];
  isLoading: boolean;
  isError: boolean;
}

// Separater Hook statt useCity.ts zu erweitern (Teil 8 "Mini City") - eine
// eigenstaendige Datenquelle (Automatisierungs-Regeln/-Vorschlaege/
// -Ausfuehrungen statt Dashboard/Projekt-Health), die CityView.tsx additiv
// dazu-rendert. useCity.ts bleibt dadurch unveraendert (kein Regressions-
// risiko fuer die bestehende City-Ansicht).
export function useAutomationCity(): UseAutomationCityResult {
  const rulesQuery = useAutomationRules();
  const pendingQuery = useAutomationActions(undefined, "PROPOSED");
  const executionsQuery = useAutomationExecutions({ limit: 20 });

  const isLoading = rulesQuery.isLoading || pendingQuery.isLoading || executionsQuery.isLoading;
  const isError = rulesQuery.isError || pendingQuery.isError || executionsQuery.isError;

  const buildings =
    rulesQuery.data && pendingQuery.data && executionsQuery.data
      ? mapAutomationToCity(rulesQuery.data, pendingQuery.data, executionsQuery.data)
      : [];

  return { buildings, isLoading, isError };
}
