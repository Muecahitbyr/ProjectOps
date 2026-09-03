import type { Checker } from "./check.interface";
import { httpGet, toHttpErrorMessage } from "./http-probe.util";

// GTCC-Audit 2026-09-03: der bisherige "gtcc-itunes"-Check (type: "http")
// prueft nur die generelle Erreichbarkeit der iTunes Search API (feste
// Beispiel-Query fuer den GuessSong-Song-Pool) - er fragt nie die eigene App
// ab und haette eine Entfernung aus dem App Store nie bemerkt. Dieser Check
// fragt gezielt per bundleId nach der eigenen App und wertet den Body aus:
// die iTunes Lookup API antwortet bei einer entfernten/nie freigegebenen App
// trotzdem mit HTTP 200 und resultCount: 0, statt einem Fehlerstatus.
interface ItunesLookupResponse {
  resultCount?: number;
}

export const appStoreChecker: Checker = {
  type: "app-store",

  async run(project, check) {
    const checkedAt = new Date().toISOString();

    if (!check.target) {
      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ERROR",
        error: "Keine Bundle-ID (target) konfiguriert",
        checkedAt,
      };
    }

    const startedAt = Date.now();
    const lookupUrl = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(check.target)}`;

    try {
      const response = await httpGet(lookupUrl);
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

      const body = response.data as ItunesLookupResponse;
      const resultCount = body?.resultCount ?? 0;

      if (resultCount < 1) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "ERROR",
          statusCode: response.status,
          responseTimeMs,
          error: `App mit Bundle-ID "${check.target}" nicht im App Store gefunden (resultCount: ${resultCount}) - vermutlich entfernt oder nicht freigegeben`,
          checkedAt,
          metadata: { resultCount },
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
        metadata: { resultCount },
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
