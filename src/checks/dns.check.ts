import { resolve as dnsResolve } from "node:dns/promises";
import type { Checker } from "./check.interface";

const TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export const dnsChecker: Checker = {
  type: "dns",

  async run(project, check) {
    const checkedAt = new Date().toISOString();

    if (!check.target) {
      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ERROR",
        error: "Kein Host (target) konfiguriert",
        checkedAt,
      };
    }

    const startedAt = Date.now();

    try {
      const addresses = await withTimeout(dnsResolve(check.target), TIMEOUT_MS);
      const responseTimeMs = Date.now() - startedAt;

      if (addresses.length === 0) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "ERROR",
          responseTimeMs,
          error: "Keine DNS-Eintraege gefunden",
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
