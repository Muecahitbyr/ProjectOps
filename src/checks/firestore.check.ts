import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { App } from "firebase-admin/app";
import type { Checker } from "./check.interface";
import { firebaseServiceAccountEnvVar, getFirebaseApp } from "./firebase-admin.util";

const TIMEOUT_MS = 5000;
const HEALTH_COLLECTION = "_projectops_health";
const LOBBIES_COLLECTION = "lobbies";

// Phase 53 "Multi-Project Production Monitoring Integration" - GuessTheCapitalCity
// besitzt laut Discovery Report ein expiresAt-Feld auf lobbies OHNE
// automatischen Cleanup. Reine Count-Aggregation (count(), kein Dokumenten-
// Download) gegen die ECHTE Produktions-Collection - read-only, keine
// Lobby wird angelegt/geloescht/veraendert. Ein Fehlschlag hier degradiert
// NICHT den eigentlichen Firestore-Erreichbarkeits-Check (separater
// try/catch) - die Kern-Health-Aussage bleibt unabhaengig von dieser
// zusaetzlichen Business-Metric gueltig.
async function collectGtccLobbyMetric(app: App): Promise<Record<string, unknown> | undefined> {
  try {
    const db = getFirestore(app);
    const now = Timestamp.now();
    const [expiredSnap, activeSnap] = await Promise.all([
      db.collection(LOBBIES_COLLECTION).where("expiresAt", "<", now).count().get(),
      db.collection(LOBBIES_COLLECTION).where("expiresAt", ">=", now).count().get(),
    ]);
    return { expiredLobbyCount: expiredSnap.data().count, activeLobbyCount: activeSnap.data().count };
  } catch (err) {
    return { lobbyMetricError: err instanceof Error ? err.message : "Unbekannter Fehler" };
  }
}

export const firestoreChecker: Checker = {
  type: "firestore",

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
      // Lesetest gegen eine dedizierte Health-Collection - vermeidet Seiteneffekte
      // auf echten Projektdaten und funktioniert auch, wenn die Collection leer ist.
      await Promise.race([
        getFirestore(app).collection(HEALTH_COLLECTION).limit(1).get(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), TIMEOUT_MS)),
      ]);

      const metadata = check.businessMetric === "gtcc-lobbies" ? await collectGtccLobbyMetric(app) : undefined;

      return {
        checkId: check.id,
        projectId: project.id,
        type: check.type,
        status: "ONLINE",
        responseTimeMs: Date.now() - startedAt,
        checkedAt,
        ...(metadata ? { metadata } : {}),
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
