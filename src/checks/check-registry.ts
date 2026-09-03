import type { CheckType } from "../types/project.types";
import type { Checker } from "./check.interface";
import { httpChecker } from "./http.check";
import { apiHealthChecker } from "./api-health.check";
import { responseTimeChecker } from "./response-time.check";
import { sslChecker } from "./ssl.check";
import { dnsChecker } from "./dns.check";
import { firebaseStatusChecker } from "./firebase-status.check";
import { firestoreChecker } from "./firestore.check";
import { firebaseStorageChecker } from "./firebase-storage.check";
import { stripeChecker } from "./stripe.check";
import { stripeStatusChecker } from "./stripe-status.check";
import { countriesNowChecker } from "./countriesnow.check";
import { appStoreChecker } from "./app-store.check";

// Weitere Check-Typen werden hier einfach als zusaetzlicher Eintrag registriert.
const checkers = new Map<CheckType, Checker>([
  [httpChecker.type, httpChecker],
  [apiHealthChecker.type, apiHealthChecker],
  [responseTimeChecker.type, responseTimeChecker],
  [sslChecker.type, sslChecker],
  [dnsChecker.type, dnsChecker],
  [firebaseStatusChecker.type, firebaseStatusChecker],
  [firestoreChecker.type, firestoreChecker],
  [firebaseStorageChecker.type, firebaseStorageChecker],
  [stripeChecker.type, stripeChecker],
  [stripeStatusChecker.type, stripeStatusChecker],
  [countriesNowChecker.type, countriesNowChecker],
  [appStoreChecker.type, appStoreChecker],
]);

export function getChecker(type: CheckType): Checker | undefined {
  return checkers.get(type);
}

// Phase 13 Teil 1 "Monitoring Agents" (capabilities) - die echten, in diesem
// Prozess registrierten Check-Typen, keine erfundene Liste.
export function listRegisteredCheckTypes(): CheckType[] {
  return [...checkers.keys()];
}
