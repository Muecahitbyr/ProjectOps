import { getAuth } from "firebase-admin/auth";
import type { Checker } from "./check.interface";
import { firebaseServiceAccountEnvVar, getFirebaseApp } from "./firebase-admin.util";

const TIMEOUT_MS = 5000;

export const firebaseStatusChecker: Checker = {
  type: "firebase-status",

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
      // Leichte Admin-API-Anfrage, um Erreichbarkeit und gueltige Credentials zu pruefen.
      await Promise.race([
        getAuth(app).listUsers(1),
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
