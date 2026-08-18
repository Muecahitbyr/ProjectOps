import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claudeClient } from "./claude-client";
import { logger } from "../core/logger";
import type { ProjectConfig } from "../types/project.types";
import type { CheckResult } from "../types/check-result.types";
import type { IncidentAnalysis, IncidentAnalysisContext } from "./analysis.types";

const AnalysisSchema = z.object({
  summary: z.string().describe("Ein-Satz-Zusammenfassung des Problems"),
  rootCause: z.string().describe("Kurze, konkrete Vermutung zur wahrscheinlichsten Ursache des Ausfalls"),
  recommendation: z.string().describe("Der wichtigste naechste Schritt zur Behebung (Kurzform von recommendedSteps[0])"),
  affectedSystems: z.array(z.string()).describe("Betroffene Systeme/Komponenten/Projekte, inkl. des aktuellen Projekts"),
  recommendedSteps: z.array(z.string()).describe("Konkrete, geordnete Handlungsschritte zur Behebung"),
  confidenceScore: z.number().min(0).max(1).describe("Wie sicher die Analyse ist (0 = reine Vermutung, 1 = sehr sicher)"),
});

// Exportiert, damit z.B. dashboard.repository.ts erkennen kann, ob ein
// gespeichertes ai_analysis-Ergebnis eine echte Analyse oder dieser
// Fallback ist - ohne den Text als Magic String zu duplizieren.
export const FALLBACK_ANALYSIS: IncidentAnalysis = {
  summary: "Automatische Analyse nicht verfuegbar",
  rootCause: "Unbekannt",
  recommendation: "Bitte den Check manuell pruefen",
  affectedSystems: [],
  recommendedSteps: ["Bitte den Check manuell pruefen"],
  confidenceScore: 0,
};

function buildPrompt(
  project: ProjectConfig,
  result: CheckResult,
  history: CheckResult[],
  context: IncidentAnalysisContext,
): string {
  const historyText = history
    .map((entry) => `${entry.checkedAt}: ${entry.status}${entry.error ? ` (${entry.error})` : ""}`)
    .join("\n");

  const similarText = context.similarPastIncidents
    .map((entry) => {
      const resolvedText =
        entry.resolvedAfterMs === null ? "noch ungeloest" : `nach ${Math.round(entry.resolvedAfterMs / 60_000)} Minuten geloest`;
      return `- ${entry.occurredAt}: "${entry.title}" (${resolvedText})`;
    })
    .join("\n");

  return [
    `Projekt: ${project.name} (${project.type})`,
    `Check: ${result.checkId} (${result.type})`,
    `Aktueller Fehler: ${result.error ?? "unbekannt"}`,
    result.responseTimeMs !== undefined ? `Antwortzeit bis zum Fehler: ${result.responseTimeMs}ms` : undefined,
    `Response-Time-Trend dieses Checks: ${context.responseTimeTrend}`,
    "",
    "Letzte Statusaenderungen dieses Checks (neueste zuerst):",
    historyText || "keine Historie vorhanden",
    "",
    "Aehnliche vergangene Incidents desselben Checks:",
    similarText || "keine vorhanden",
    "",
    "Andere Projekte mit aktuell offenem Incident auf einem Check desselben Typs (moegliche gemeinsame Ursache):",
    context.affectedComponents.length > 0 ? context.affectedComponents.join(", ") : "keine",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export async function analyzeIncident(
  project: ProjectConfig,
  result: CheckResult,
  history: CheckResult[],
  context: IncidentAnalysisContext,
): Promise<IncidentAnalysis> {
  try {
    const response = await claudeClient.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2048,
      system:
        "Du bist ein SRE-Assistent fuer ProjectOps. Analysiere Monitoring-Ausfaelle kurz, konkret und auf Deutsch. " +
        "Nutze den bereitgestellten historischen Kontext (aehnliche Incidents, betroffene Systeme, Response-Time-Trend), " +
        "um eine realistische Ursache und einen ehrlichen confidenceScore einzuschaetzen - rate nicht ins Blaue, " +
        "wenn der Kontext keine klare Ursache hergibt, senke den confidenceScore entsprechend.",
      messages: [{ role: "user", content: buildPrompt(project, result, history, context) }],
      output_config: {
        format: zodOutputFormat(AnalysisSchema),
        effort: "low",
      },
    });

    if (!response.parsed_output) {
      logger.warn("KI-Analyse ohne verwertbares Ergebnis", { checkId: result.checkId });
      return FALLBACK_ANALYSIS;
    }

    return response.parsed_output;
  } catch (err) {
    logger.error("KI-Analyse fehlgeschlagen", {
      checkId: result.checkId,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    });
    return FALLBACK_ANALYSIS;
  }
}
