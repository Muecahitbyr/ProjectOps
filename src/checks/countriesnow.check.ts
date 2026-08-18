import type { Checker } from "./check.interface";
import { httpGet, toHttpErrorMessage } from "./http-probe.util";

// Phase 53 "Multi-Project Production Monitoring Integration" - laut
// GuessTheCapitalCity Discovery Report ist countriesnow.space ein Single
// Point of Failure fuer die Quiz-Datenbasis. HTTP 200 allein beweist nicht,
// dass verwertbare Laender-/Hauptstadt-Daten geliefert wurden (die API
// selbst signalisiert Fehler ueber ein error-Feld im Body, nicht ueber den
// HTTP-Status) - deshalb echte, fachliche Body-Validierung statt reinem
// Status-Check.
interface CountriesNowResponse {
  error?: boolean;
  data?: unknown[];
}

export const countriesNowChecker: Checker = {
  type: "countriesnow",

  async run(project, check) {
    const checkedAt = new Date().toISOString();

    if (!check.target) {
      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ERROR",
        error: "Keine API-URL (target) konfiguriert",
        checkedAt,
      };
    }

    const startedAt = Date.now();

    try {
      const response = await httpGet(check.target);
      const responseTimeMs = Date.now() - startedAt;

      if (response.status < 200 || response.status >= 300) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "ERROR",
          statusCode: response.status,
          responseTimeMs,
          error: `Unerwarteter HTTP-Status ${response.status}`,
          checkedAt,
        };
      }

      const body = response.data as CountriesNowResponse;
      if (body?.error !== false) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "ERROR",
          statusCode: response.status,
          responseTimeMs,
          error: `countriesnow.space meldet error=${JSON.stringify(body?.error)} im Antwort-Body`,
          checkedAt,
        };
      }
      if (!Array.isArray(body.data) || body.data.length === 0) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "ERROR",
          statusCode: response.status,
          responseTimeMs,
          error: "countriesnow.space liefert eine leere oder fehlende Laenderliste (data)",
          checkedAt,
          metadata: { dataCount: Array.isArray(body.data) ? body.data.length : 0 },
        };
      }

      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ONLINE",
        statusCode: response.status,
        responseTimeMs,
        checkedAt,
        metadata: { dataCount: body.data.length },
      };
    } catch (err) {
      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "OFFLINE",
        responseTimeMs: Date.now() - startedAt,
        error: toHttpErrorMessage(err),
        checkedAt,
      };
    }
  },
};
