import { getStorage } from "firebase-admin/storage";
import type { Checker } from "./check.interface";
import { firebaseServiceAccountEnvVar, getFirebaseApp } from "./firebase-admin.util";

const TIMEOUT_MS = 5000;

// Phase 53 "Multi-Project Production Monitoring Integration" - DriveConnect
// nutzt Firebase Storage (siehe Discovery Report). Identisches Credential-
// und App-Instanz-Pattern wie firebase-status.check.ts/firestore.check.ts
// (firebase-admin.util.ts), nur ein anderer, minimal-invasiver Lesetest
// (Bucket-Metadaten statt Auth-Listing/Firestore-Read).
export const firebaseStorageChecker: Checker = {
  type: "firebase-storage",

  async run(project, check) {
    const checkedAt = new Date().toISOString();

    if (!check.target) {
      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ERROR",
        error: "Keine Firebase Projekt-ID (target) konfiguriert",
        checkedAt,
      };
    }

    const app = getFirebaseApp(check.target);
    if (!app) {
      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ERROR",
        error: `Firebase nicht konfiguriert (${firebaseServiceAccountEnvVar(check.target)} fehlt)`,
        checkedAt,
      };
    }

    const startedAt = Date.now();

    try {
      // Reiner Metadaten-Lesetest (kein Dateiinhalt, keine Liste realer
      // Dateien ueber 1 hinaus) - beweist Erreichbarkeit + gueltige
      // Credentials fuer den Standard-Bucket, ohne Nutzerdaten zu lesen.
      await Promise.race([
        getStorage(app).bucket().getFiles({ maxResults: 1 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), TIMEOUT_MS)),
      ]);

      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ONLINE",
        responseTimeMs: Date.now() - startedAt,
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
