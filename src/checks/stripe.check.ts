import Stripe from "stripe";
import type { Checker } from "./check.interface";

const TIMEOUT_MS = 5000;

function getStripeClient(): Stripe | undefined {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    return undefined;
  }
  return new Stripe(apiKey, { timeout: TIMEOUT_MS });
}

export const stripeChecker: Checker = {
  type: "stripe",

  async run(project, check) {
    const checkedAt = new Date().toISOString();

    const stripe = getStripeClient();
    if (!stripe) {
      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ERROR",
        error: "Stripe nicht konfiguriert (STRIPE_SECRET_KEY fehlt)",
        checkedAt,
      };
    }

    const startedAt = Date.now();

    try {
      const account = await stripe.accounts.retrieveCurrent();
      const responseTimeMs = Date.now() - startedAt;

      if (!account.charges_enabled) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "WARNING",
          responseTimeMs,
          error: "Stripe-Account kann aktuell keine Zahlungen entgegennehmen",
          checkedAt,
        };
      }

      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ONLINE",
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
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
        checkedAt,
      };
    }
  },
};
