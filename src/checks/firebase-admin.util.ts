import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

const apps = new Map<string, App>();

// Credentials werden ueber FIREBASE_SERVICE_ACCOUNT_<PROJECT_ID> (base64-kodiertes
// Service-Account-JSON) pro Firebase-Projekt konfiguriert. Ohne diese Variable
// ist der Check bewusst nicht lauffaehig (kein Rateraten, keine Fake-Daten).
export function firebaseServiceAccountEnvVar(projectId: string): string {
  return `FIREBASE_SERVICE_ACCOUNT_${projectId.toUpperCase().replace(/-/g, "_")}`;
}

export function getFirebaseApp(projectId: string): App | undefined {
  const cached = apps.get(projectId);
  if (cached) {
    return cached;
  }

  // Bereits registrierte App wiederverwenden (z.B. nach Hot-Reload im dev-Modus).
  const existing = getApps().find((app) => app.name === projectId);
  if (existing) {
    apps.set(projectId, existing);
    return existing;
  }

  const raw = process.env[firebaseServiceAccountEnvVar(projectId)];
  if (!raw) {
    return undefined;
  }

  try {
    const serviceAccount = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    const app = initializeApp({ credential: cert(serviceAccount) }, projectId);
    apps.set(projectId, app);
    return app;
  } catch {
    return undefined;
  }
}
