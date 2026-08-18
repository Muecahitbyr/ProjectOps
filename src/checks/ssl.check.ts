import tls from "node:tls";
import type { Checker } from "./check.interface";

const DEFAULT_WARNING_DAYS = 30;
const TIMEOUT_MS = 5000;

interface CertInfo {
  daysRemaining: number;
  authorized: boolean;
}

function fetchCertificate(host: string, port = 443): Promise<CertInfo> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port, servername: host, timeout: TIMEOUT_MS, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        socket.end();

        if (!cert || !cert.valid_to) {
          reject(new Error("Kein Zertifikat empfangen"));
          return;
        }

        const validTo = new Date(cert.valid_to);
        const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        resolve({ daysRemaining, authorized });
      },
    );

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Timeout"));
    });
    socket.on("error", (err) => reject(err));
  });
}

export const sslChecker: Checker = {
  type: "ssl",

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

    const warningDays = check.thresholds?.warning ?? DEFAULT_WARNING_DAYS;

    try {
      const { daysRemaining, authorized } = await fetchCertificate(check.target);

      if (daysRemaining < 0) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "ERROR",
          error: `Zertifikat ist seit ${Math.abs(daysRemaining)} Tagen abgelaufen`,
          checkedAt,
        };
      }

      if (!authorized) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "ERROR",
          error: "Zertifikat ist nicht vertrauenswuerdig (Zertifikatskette ungueltig)",
          checkedAt,
        };
      }

      if (daysRemaining < warningDays) {
        return {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "WARNING",
          error: `Zertifikat laeuft in ${daysRemaining} Tagen ab`,
          checkedAt,
          metadata: { daysRemaining },
        };
      }

      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ONLINE",
        checkedAt,
        // Strukturiert gespeichert (statt nur in der Fehlermeldung bei
        // WARNING) - wird von der SSL_EXPIRY-Alert-Regel ausgewertet
        // (src/alerts/alert-evaluator.ts, Phase 7).
        metadata: { daysRemaining },
      };
    } catch (err) {
      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "OFFLINE",
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
        checkedAt,
      };
    }
  },
};
