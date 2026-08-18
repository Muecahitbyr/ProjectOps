import type { Checker } from "./check.interface";
import { httpGet, toHttpErrorMessage } from "./http-probe.util";

// Phase 53 "Multi-Project Production Monitoring Integration" - Rechnos
// echte Abhaengigkeit von Stripe als Zahlungsanbieter ist ueber die
// oeffentliche, unauthenticated Statusseite beobachtbar (kein Secret
// noetig, anders als stripe.check.ts's account-gebundener Check). Der
// eigentliche Status steckt im JSON-Body (status.indicator), nicht im
// HTTP-Statuscode - status.stripe.com antwortet auch waehrend eines
// Vorfalls mit HTTP 200.
interface StripeStatusResponse {
  status?: { indicator?: string; description?: string };
}

export const stripeStatusChecker: Checker = {
  type: "stripe-status",

  async run(project, check) {
    const checkedAt = new Date().toISOString();

    if (!check.target) {
      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ERROR",
        error: "Keine Statusseiten-URL (target) konfiguriert",
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
          error: `Unerwarteter HTTP-Status ${response.status} von der Stripe-Statusseite`,
          checkedAt,
        };
      }

      const body = response.data as StripeStatusResponse;
      const indicator = body?.status?.indicator;
      if (typeof indicator !== "string") {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "ERROR",
          statusCode: response.status,
          responseTimeMs,
          error: "Antwort der Stripe-Statusseite hat kein auswertbares status.indicator-Feld",
          checkedAt,
        };
      }

      const description = body.status?.description ?? indicator;
      if (indicator === "none") {
        return { checkId: check.id, projectId: project.id, type: check.type, status: "ONLINE", statusCode: response.status, responseTimeMs, checkedAt, metadata: { indicator, description } };
      }
      if (indicator === "minor") {
        return { checkId: check.id, projectId: project.id, type: check.type, status: "WARNING", statusCode: response.status, responseTimeMs, error: description, checkedAt, metadata: { indicator, description } };
      }
      // "major" | "critical" | jeder unbekannte, nicht "none"/"minor" Wert -
      // bewusst konservativ als Ausfall gewertet statt eines unbekannten
      // Indikators still zu ignorieren.
      return { checkId: check.id, projectId: project.id, type: check.type, status: "ERROR", statusCode: response.status, responseTimeMs, error: description, checkedAt, metadata: { indicator, description } };
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
