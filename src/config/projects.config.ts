import type { ProjectConfig } from "../types/project.types";

// Neue Projekte werden hier als weiterer Eintrag hinzugefuegt.
//
// firebase-status/firestore: "target" muss die Firebase-Projekt-ID sein, und
// FIREBASE_SERVICE_ACCOUNT_<PROJECT_ID> (base64-Service-Account-JSON) muss in
// der .env gesetzt sein - siehe .env.example. Ohne beides liefert der Check
// bewusst ERROR statt geraten/erfundene Daten anzuzeigen.
//
// api-health: "target" muss auf den jeweiligen API-Health-Endpunkt zeigen,
// sobald dieser bekannt ist.
// Von alert-evaluator.ts/incident-correlation.ts genutzt, um zu einer
// projectId den Anzeigenamen fuer Notification-Events aufzuloesen, ohne
// core/monitor.ts (und damit einen Zirkelbezug) importieren zu muessen.
export function getProjectName(projectId: string): string {
  return projects.find((project) => project.id === projectId)?.name ?? projectId;
}

export const projects: ProjectConfig[] = [
  {
    id: "rechno",
    name: "Rechno",
    type: "mobile-app",
    description: "Native iOS App mit Firebase (rechno-bf8d7), Firestore, Stripe Connect und 8 Cloud Functions/Cloud Run Endpunkten",
    // Phase 55 "Vollstaendige Projekt-Informationsintegration" - reale, im
    // Rechno Project Discovery Report genannte Fakten, die ueber die bereits
    // per checks[] abgebildeten Endpunkte hinausgehen. Firebase-Projekt-ID
    // bewusst nicht wiederholt (bereits in checks[].target).
    techProfile: {
      platform: "Native iOS App",
      firebaseRegion: "europe-west1",
      businessSignals: ["Checkout verfuegbar", "Invoice Finalization verfuegbar", "Connect Account Payment Ready", "Stripe Webhook erreichbar"],
    },
    checks: [
      // Phase 53 "Multi-Project Production Monitoring Integration" - reale
      // Firebase-Projekt-ID aus dem Rechno Project Discovery Report.
      { id: "rechno-firebase", type: "firebase-status", target: "rechno-bf8d7", intervalMinutes: 5, enabled: true }, // Credential: FIREBASE_SERVICE_ACCOUNT_RECHNO_BF8D7 (nicht gesetzt)
      { id: "rechno-firestore", type: "firestore", target: "rechno-bf8d7", intervalMinutes: 5, enabled: true }, // Credential: FIREBASE_SERVICE_ACCOUNT_RECHNO_BF8D7 (nicht gesetzt)
      // Phase 55 Reconciliation - oeffentlicher, unauthenticated Firestore-
      // REST-Erreichbarkeitscheck, KEIN Service-Account noetig (anders als
      // "rechno-firestore" oben). Zwei Abweichungen von der urspruenglichen
      // Vorgabe wurden am 18.08.2026 live per curl verifiziert und hier
      // korrigiert, statt einen dauerhaft fehlschlagenden Check anzulegen:
      // (1) die reine ".../documents"-Basis-URL ohne Collection-Segment ist
      // laut Firestore-REST-API-Spezifikation kein gueltiges Ziel (liefert
      // 404 "Not Found", keine Google-Firestore-Fehlerantwort, sondern eine
      // generische Google-404-Seite) - ".../documents/{collectionId}" ist
      // die kleinste gueltige Form. Statt einer geratenen echten Rechno-
      // Collection wird dieselbe bereits etablierte, seiteneffektfreie
      // Sonde "_projectops_health" wiederverwendet, die firestore.check.ts
      // (Admin-SDK-Pfad) bereits fuer denselben Zweck nutzt. (2) der real
      // beobachtete Status eines unauthenticated Requests ist 403
      // ("PERMISSION_DENIED"), nicht 401 - Firestore REST antwortet damit,
      // nicht mit 401, wenn keine Anmeldeinformationen mitgeschickt werden.
      // Ein Treffer beweist nur Erreichbarkeit + korrektes Auth-Gating,
      // keine tatsaechliche Dateninhalt-Pruefung.
      { id: "rechno-firestore-rest", type: "api-health", target: "https://firestore.googleapis.com/v1/projects/rechno-bf8d7/databases/(default)/documents/_projectops_health", intervalMinutes: 5, enabled: true, expectedStatusCodes: [403] },
      { id: "rechno-stripe", type: "stripe", intervalMinutes: 5, enabled: true }, // nutzt STRIPE_SECRET_KEY (nicht gesetzt)
      // Der im Discovery Report genannte JSON-Endpunkt
      // (status.stripe.com/api/v2/status.json) wurde vor der Uebernahme live
      // per curl verifiziert und liefert 404 - Stripes Statusseite ist
      // mittlerweile eine client-gerenderte SPA ohne dort auffindbare
      // oeffentliche JSON-API (mehrere plausible statuspage.io-Pfade
      // ebenfalls live geprueft, alle 404). Der stripe-status-Checker-Typ
      // (JSON-Body-Auswertung) bleibt implementiert, wird hier aber NICHT
      // verwendet, um keine erfundene URL einzutragen - stattdessen reiner
      // Erreichbarkeits-Check (Typ http) gegen die echte, live bestaetigte
      // (200) Statusseiten-URL. Siehe Abschlussbericht Punkt 22.
      { id: "rechno-stripe-status", type: "http", target: "https://status.stripe.com/", intervalMinutes: 5, enabled: true },
      // 8 reale Cloud Functions/Cloud Run Endpunkte. Die erwarteten Status-
      // codes wurden NICHT ungeprueft aus dem Discovery Report uebernommen,
      // sondern am 17.08.2026 live per curl (GET, read-only) gegen die
      // echten Produktions-URLs verifiziert - dabei angewichen von der
      // Annahme des Discovery Reports: 5 der 8 Endpunkte sind offenbar reine
      // POST-Callable-Functions und antworten auf GET mit 405 (Method Not
      // Allowed), nicht mit 401. Nur checkStripePaymentStatus und
      // getConnectAccountStatus pruefen Auth bereits bei GET (401);
      // stripeWebhook bestaetigt exakt den erwarteten 400. Jeder Treffer
      // beweist NUR Erreichbarkeit, nicht vollstaendige fachliche
      // Korrektheit (z.B. ob der Webhook echte Events tatsaechlich korrekt
      // verarbeitet - das kann ProjectOps ohne eine echte, signierte
      // Stripe-Anfrage nicht pruefen).
      { id: "rechno-fn-checkout", type: "api-health", target: "https://createstripecheckoutsession-lhj7nrzybq-ew.a.run.app", intervalMinutes: 5, enabled: true, expectedStatusCodes: [405] },
      { id: "rechno-fn-payment-status", type: "api-health", target: "https://checkstripepaymentstatus-lhj7nrzybq-ew.a.run.app", intervalMinutes: 5, enabled: true, expectedStatusCodes: [401] },
      { id: "rechno-fn-webhook", type: "api-health", target: "https://stripewebhook-lhj7nrzybq-ew.a.run.app", intervalMinutes: 5, enabled: true, expectedStatusCodes: [400] },
      { id: "rechno-fn-finalize-invoice", type: "api-health", target: "https://europe-west1-rechno-bf8d7.cloudfunctions.net/finalizeInvoice", intervalMinutes: 5, enabled: true, expectedStatusCodes: [405] },
      { id: "rechno-fn-connect-create", type: "api-health", target: "https://europe-west1-rechno-bf8d7.cloudfunctions.net/createConnectAccount", intervalMinutes: 5, enabled: true, expectedStatusCodes: [405] },
      { id: "rechno-fn-connect-onboarding", type: "api-health", target: "https://europe-west1-rechno-bf8d7.cloudfunctions.net/getConnectOnboardingLink", intervalMinutes: 5, enabled: true, expectedStatusCodes: [405] },
      // Business Signal "Connect Account Payment Ready" (isPaymentReady/
      // chargesEnabled/payoutsEnabled) ist NICHT read-only unauthenticated
      // pruefbar - dieser Check bleibt bewusst ein reiner Erreichbarkeits-
      // nachweis (siehe Abschlussbericht Punkt 22 "Nicht implementiert").
      { id: "rechno-fn-connect-status", type: "api-health", target: "https://europe-west1-rechno-bf8d7.cloudfunctions.net/getConnectAccountStatus", intervalMinutes: 5, enabled: true, expectedStatusCodes: [401] },
      { id: "rechno-fn-connect-dashboard", type: "api-health", target: "https://europe-west1-rechno-bf8d7.cloudfunctions.net/createExpressDashboardLink", intervalMinutes: 5, enabled: true, expectedStatusCodes: [405] },
      // Ersetzt durch die 8 spezifischen Cloud-Function-Checks oben -
      // deaktiviert statt geloescht (Historie bleibt erhalten), kein
      // erfundenes generisches Ziel.
      { id: "rechno-api", type: "api-health", intervalMinutes: 5, enabled: false },
    ],
  },
  {
    id: "driveconnect",
    name: "DriveConnect",
    type: "mobile-app",
    description: "Native iOS App (de.mbdevelopment.driveconnect), kein eigener Server - Firebase Auth/Firestore/Storage direkt ueber SDK",
    techProfile: {
      platform: "Native iOS App",
      bundleId: "de.mbdevelopment.driveconnect",
      firestoreCollections: ["users", "users/{uid}/cars", "runs", "feedback"],
      businessSignals: ["Registrierungen", "Runs gespeichert", "Feedback eingegangen"],
    },
    checks: [
      { id: "driveconnect-firebase", type: "firebase-status", target: "driveconnect-e6297", intervalMinutes: 5, enabled: true }, // Credential: FIREBASE_SERVICE_ACCOUNT_DRIVECONNECT_E6297 (nicht gesetzt)
      { id: "driveconnect-firestore", type: "firestore", target: "driveconnect-e6297", intervalMinutes: 5, enabled: true }, // Credential: FIREBASE_SERVICE_ACCOUNT_DRIVECONNECT_E6297 (nicht gesetzt)
      { id: "driveconnect-storage", type: "firebase-storage", target: "driveconnect-e6297", intervalMinutes: 5, enabled: true }, // Credential: FIREBASE_SERVICE_ACCOUNT_DRIVECONNECT_E6297 (nicht gesetzt)
      // DriveConnect hat laut Discovery Report KEINEN eigenen Server/HTTP-API
      // - dieser Platzhalter-Check hatte nie ein reales Ziel und wird
      // deaktiviert statt mit einer erfundenen URL befuellt.
      { id: "driveconnect-api", type: "api-health", intervalMinutes: 5, enabled: false },
    ],
  },
  {
    id: "guess-the-capital-city",
    name: "GuessTheCapitalCity",
    type: "mobile-app",
    description: "Native iOS Quiz-App mit Firebase (guessthecapitalcity), countriesnow.space, flagcdn.com und CartoDB",
    techProfile: {
      platform: "Native iOS Quiz-App",
      firestoreCollections: ["/lobbies/{lobbyCode}"],
      businessSignals: ["aktive Lobbys", "abgelaufene Lobbys", "Quiz-Datenbasis verfuegbar", "Flaggen abrufbar", "Kartendienst verfuegbar"],
      // Phase 55 Reconciliation - bislang nur als Code-Kommentar in
      // firestore.check.ts dokumentiert, jetzt zusaetzlich als strukturiertes
      // Projekt-Metadatum persistiert. Rein deskriptiv: kein Cleanup wird
      // hierdurch ausgeloest oder impliziert - die bereits bestehende
      // gtcc-lobbies-Metrik (Check "gtcc-firestore") bleibt unveraendert die
      // einzige Messquelle fuer die tatsaechliche Lobby-Anzahl.
      operationalNotes: ["Firestore-Lobbys (lobbies/{lobbyCode}) besitzen ein expiresAt-Feld, aber es existiert kein automatischer Cleanup abgelaufener Lobbys (Stand: Project Discovery Report)."],
    },
    checks: [
      { id: "gtcc-firebase", type: "firebase-status", target: "guessthecapitalcity", intervalMinutes: 5, enabled: true }, // Credential: FIREBASE_SERVICE_ACCOUNT_GUESSTHECAPITALCITY (nicht gesetzt)
      // businessMetric: zaehlt zusaetzlich abgelaufene/aktive Lobbys in der
      // echten lobbies-Collection (expiresAt hat laut Discovery Report keinen
      // automatischen Cleanup) - read-only Aggregation, siehe firestore.check.ts.
      { id: "gtcc-firestore", type: "firestore", target: "guessthecapitalcity", intervalMinutes: 5, enabled: true, businessMetric: "gtcc-lobbies" }, // Credential: FIREBASE_SERVICE_ACCOUNT_GUESSTHECAPITALCITY (nicht gesetzt)
      // Laut Discovery Report Single Point of Failure fuer die Quiz-Datenbasis
      // - Body-validiert (error==false, data.length>0), nicht nur HTTP 200.
      { id: "gtcc-countriesnow", type: "countriesnow", target: "https://countriesnow.space/api/v0.1/countries/capital", intervalMinutes: 5, enabled: true },
      // Ein festes, immer gueltiges Beispielland (Deutschland) genuegt fuer
      // einen reinen Erreichbarkeits-/Content-Type-Nachweis des CDN.
      { id: "gtcc-flagcdn", type: "http", target: "https://flagcdn.com/w320/de.png", intervalMinutes: 5, enabled: true, expectedContentType: "image/png" },
      { id: "gtcc-cartodb", type: "http", target: "https://a.basemaps.cartocdn.com/dark_nolabels/0/0/0.png", intervalMinutes: 5, enabled: true },
      // GuessTheCapitalCity hat laut Discovery Report keinen eigenen Server -
      // dieser Platzhalter-Check hatte nie ein reales Ziel und wird
      // deaktiviert statt mit einer erfundenen URL befuellt.
      { id: "gtcc-api", type: "api-health", intervalMinutes: 5, enabled: false },
    ],
  },
  {
    id: "bayar-solutions",
    name: "bayar-solutions.de",
    type: "website",
    description: "Website mit SSL, Domain und Antwortzeit-Monitoring",
    checks: [
      { id: "bayar-http", type: "http", target: "https://bayar-solutions.de", intervalMinutes: 5, enabled: true },
      {
        id: "bayar-ssl",
        type: "ssl",
        target: "bayar-solutions.de",
        intervalMinutes: 60,
        enabled: true,
        thresholds: { warning: 30 }, // Warnung, wenn Zertifikat in < 30 Tagen ablaeuft
      },
      { id: "bayar-dns", type: "dns", target: "bayar-solutions.de", intervalMinutes: 60, enabled: true },
      {
        id: "bayar-response-time",
        type: "response-time",
        target: "https://bayar-solutions.de",
        intervalMinutes: 5,
        enabled: true,
        thresholds: { warning: 800, critical: 2000 }, // ms
      },
    ],
  },
];
