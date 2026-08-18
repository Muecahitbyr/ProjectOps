// Auftragspunkt 3 "Notification Infrastructure" (Phase 10): einheitliches
// Payload-Format fuer Alert-/Wartungs-/Root-Incident-Benachrichtigungen -
// bewusst UNABHAENGIG von ai/analysis.types.ts (IncidentAnalysis), da diese
// Ereignisse ohne KI-Analyse entstehen. Die bestehende, an IncidentAnalysis
// gekoppelte notifications/notification.types.ts (Offline-Benachrichtigung
// mit KI-Zusammenfassung) bleibt unveraendert und getrennt bestehen.
export type NotificationEventType =
  | "ALERT_TRIGGERED"
  | "ALERT_ESCALATED"
  | "MAINTENANCE_STARTED"
  | "MAINTENANCE_ENDED"
  | "ROOT_INCIDENT_OPENED"
  // Phase 27 "Enterprise On-Call & Escalation Management" - analog zu
  // ALERT_ESCALATED (Phase 20), nur fuer Incident-Eskalation statt
  // Alert-Eskalation. Projektweiter Versand ueber dieselbe Infrastruktur
  // (kein direktes Zustellen an einen einzelnen Nutzer - dieselbe
  // Einschraenkung gilt bereits fuer ALERT_ESCALATED, dessen "Diensthabend:
  // X"-Hinweis ebenfalls nur Freitext in der Nachricht ist).
  | "INCIDENT_ESCALATED"
  // Phase 38 "Enterprise Resilience Alerting & Notification Intelligence" -
  // zwei Events fuer die beiden Richtungen eines Resilience-Status-Uebergangs
  // (core/resilience-alerting.ts), dasselbe Zwei-Richtungen-Prinzip wie
  // SLO_BREACHED/SLO_RECOVERED (core/slo-evaluator.ts). DEGRADED deckt jeden
  // Uebergang zu einem schlechteren Status ab (nicht nur nach CRITICAL),
  // RECOVERED jeden Uebergang zu einem besseren - UNKNOWN loest bewusst NIE
  // eines der beiden aus (siehe core/resilience-alerting.ts, Kommentar dort).
  | "RESILIENCE_STATUS_DEGRADED"
  | "RESILIENCE_STATUS_RECOVERED"
  // Phase 49 "Enterprise Risk Forecasting & Proactive Operations
  // Intelligence" - dasselbe Zwei-Richtungen-Prinzip wie RESILIENCE_STATUS_*
  // oben, aber fuer core/proactive-risk-alerting.ts's Hysterese ueber
  // core/capacity-intelligence.ts's Capacity Watchlist (Phase 46): DETECTED
  // = ein aktuell HEALTHY, business-relevanter Service zeigt neu einen
  // degradierenden Forecast-Trend; CLEARED = der Trend besteht nicht mehr.
  | "PROACTIVE_RISK_DETECTED"
  | "PROACTIVE_RISK_CLEARED";

export type NotificationEventSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

export interface NotificationEvent {
  type: NotificationEventType;
  projectId: string;
  projectName: string;
  severity: NotificationEventSeverity;
  title: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
