import type { Checker } from "./check.interface";
import { httpGet, toHttpErrorMessage } from "./http-probe.util";

export const apiHealthChecker: Checker = {
  type: "api-health",

  async run(project, check) {
    const checkedAt = new Date().toISOString();

    if (!check.target) {
      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ERROR",
        error: "Kein API-Endpunkt (target) konfiguriert",
        checkedAt,
      };
    }

    const startedAt = Date.now();

    try {
      const response = await httpGet(check.target);
      const responseTimeMs = Date.now() - startedAt;
      // APIs sollten direkt mit 2xx antworten, keine Weiterleitungen akzeptieren.
      const isHealthy = response.status >= 200 && response.status < 300;
      // Phase 53 - manche produktiven Endpunkte (z.B. Firebase Cloud
      // Functions ohne gueltiges ID-Token, Stripe-Webhooks ohne Signatur)
      // antworten ABSICHTLICH mit einem definierten Nicht-2xx-Status. Ein
      // Treffer beweist NUR Erreichbarkeit, nicht volle fachliche Korrektheit
      // (siehe expectedStatusCodes-Kommentar in types/project.types.ts) -
      // deshalb reachabilityOnly:true statt eines unqualifizierten ONLINE.
      const isExpectedStatus = check.expectedStatusCodes?.includes(response.status) ?? false;

      if (isHealthy) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "ONLINE",
          statusCode: response.status,
          responseTimeMs,
          checkedAt,
        };
      }

      if (isExpectedStatus) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "ONLINE",
          statusCode: response.status,
          responseTimeMs,
          checkedAt,
          metadata: { reachabilityOnly: true, note: `Erwarteter Status ${response.status} ohne Authentifizierung - beweist Erreichbarkeit, nicht volle fachliche Korrektheit` },
        };
      }

      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ERROR",
        statusCode: response.status,
        responseTimeMs,
        error: `Unerwarteter HTTP-Status ${response.status}${check.expectedStatusCodes ? ` (erwartet: 2xx oder ${check.expectedStatusCodes.join("/")})` : ""}`,
        checkedAt,
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
