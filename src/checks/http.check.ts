import type { Checker } from "./check.interface";
import { httpGet, toHttpErrorMessage } from "./http-probe.util";

export const httpChecker: Checker = {
  type: "http",

  async run(project, check) {
    const checkedAt = new Date().toISOString();

    if (!check.target) {
      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ERROR",
        error: "Kein Ziel (target) konfiguriert",
        checkedAt,
      };
    }

    const startedAt = Date.now();

    try {
      const response = await httpGet(check.target);
      const responseTimeMs = Date.now() - startedAt;
      const isOnline = response.status >= 200 && response.status < 400;

      if (!isOnline) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "ERROR",
          statusCode: response.status,
          responseTimeMs,
          checkedAt,
        };
      }

      // Phase 53 - z.B. flagcdn.com: HTTP 200 allein beweist nicht, dass die
      // erwartete Ressource (image/png) und nicht z.B. eine Fehlerseite
      // geliefert wurde. Ein Mismatch ist bewusst nur WARNING, nicht ERROR -
      // die Ressource IST erreichbar, nur ggf. nicht der erwartete Inhaltstyp.
      if (check.expectedContentType) {
        const contentType = String(response.headers["content-type"] ?? "");
        if (!contentType.includes(check.expectedContentType)) {
          return {
            checkId: check.id,
            projectId: project.id,
            type: check.type,
            status: "WARNING",
            statusCode: response.status,
            responseTimeMs,
            error: `Unerwarteter Content-Type "${contentType || "(keiner)"}" (erwartet: ${check.expectedContentType})`,
            checkedAt,
          };
        }
      }

      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ONLINE",
        statusCode: response.status,
        responseTimeMs,
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
