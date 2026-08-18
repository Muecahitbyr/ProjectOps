import type { CheckStatus } from "../types/check-result.types";
import type { Checker } from "./check.interface";
import { httpGet, toHttpErrorMessage } from "./http-probe.util";

const SAMPLE_COUNT = 3;
const DEFAULT_WARNING_MS = 1000;
const DEFAULT_CRITICAL_MS = 3000;

export const responseTimeChecker: Checker = {
  type: "response-time",

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

    const samples: number[] = [];

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const startedAt = Date.now();
      try {
        await httpGet(check.target);
        samples.push(Date.now() - startedAt);
      } catch (err) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "OFFLINE",
          error: toHttpErrorMessage(err),
          checkedAt,
        };
      }
    }

    const avgMs = Math.round(samples.reduce((sum, ms) => sum + ms, 0) / samples.length);
    const warningMs = check.thresholds?.warning ?? DEFAULT_WARNING_MS;
    const criticalMs = check.thresholds?.critical ?? DEFAULT_CRITICAL_MS;

    let status: CheckStatus = "ONLINE";
    if (avgMs >= criticalMs) {
      status = "ERROR";
    } else if (avgMs >= warningMs) {
      status = "WARNING";
    }

    return {
      checkId: check.id,
      projectId: project.id,
      type: check.type,
      status,
      responseTimeMs: avgMs,
      checkedAt,
      ...(status !== "ONLINE"
        ? { error: `Durchschnittliche Antwortzeit ${avgMs}ms ueberschreitet Grenzwert (${status === "ERROR" ? criticalMs : warningMs}ms)` }
        : {}),
    };
  },
};
