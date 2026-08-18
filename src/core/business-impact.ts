// Phase 47 "Enterprise Business Impact & Service Criticality Intelligence" -
// reine Verdichtungsschicht ueber bereits bestehende Daten. KEINE neue
// Criticality-/Dependency-/Signal-Quelle:
//   - Criticality/Business Owner: services.criticality/business_owner
//     (Phase 23, db/services.repository.ts) - UNVERAENDERT.
//   - Blast Radius/betroffene Services + deren Criticality/offene Incidents/
//     at-risk SLOs/getriggerte Alerts: core/topology.ts#getFullImpactAnalysis()
//     (Phase 25, bereits 15s gecacht) - in core/service-resilience.ts wird
//     dieses Objekt SOWIESO bereits fuer blastRadius/isPotentialSpof/
//     dependencies geladen; computeServiceBusinessImpact() bekommt es hier
//     nur zusaetzlich UEBERGEBEN, ruft es NIE selbst ab (0 neue Queries).
//   - "hat der Service selbst gerade ein Problem": die bereits vollstaendig
//     aufgebaute signals-Taxonomie (Phase 37-46) - jedes bestehende Signal
//     (Reliability/SLO/Problem/Change-Risk/Remediation/Blast-Radius/
//     Forecast/Capacity) zaehlt bereits als "aktives Anliegen", keine zweite
//     Bewertung noetig.
//
// ---------------------------------------------------------------------------
// ENTSCHEIDUNGSTABELLE (Auftragspunkt 7 "nachvollziehbare Logik, keine
// unbegruendeten Business-Schaetzungen"):
//
// CRITICALITY_RANK: LOW=0, MEDIUM=1, HIGH=2, CRITICAL=3 - die bereits
// bestehende Reihenfolge aus SERVICE_CRITICALITIES (types/service.types.ts),
// hier nur in eine vergleichbare Zahl uebersetzt.
//
// "involvedRanks" sammelt AUSSCHLIESSLICH Criticality-Raenge von Services,
// die GERADE ECHT betroffen sind (kein theoretischer Blast-Radius):
//   - der Root-Service selbst, NUR wenn er mindestens ein eigenes Signal hat
//     (signals.length > 0 - die bereits bestehende Taxonomie deckt jede
//     Auffaelligkeit ab, von Reliability bis Forecast).
//   - jeder Dependent im Blast-Radius, NUR wenn er in getRelatedSignals()
//     mit einem offenen Incident, einer at-risk SLO oder einem getriggerten
//     Alert auftaucht (bereits vorhandene, batched-abgefragte Fakten).
//
// Tier = leeres involvedRanks -> NONE (nichts aktuell betroffen).
//      = sonst: max(involvedRanks) -> 3=SEVERE, 2=HIGH, 1=MODERATE, 0=LOW.
//      = kein zugeordneter Service -> UNKNOWN (nie geraten).
//
// Diese Tabelle vermeidet bewusst eine gewichtete Punktesumme ueber zwei
// verschiedenskalige Werte (z.B. Signalanzahl + Criticality-Rang addiert) -
// eine Summe waere weniger nachvollziehbar und wuerde effektiv einen neuen,
// unbegruendeten Umrechnungsfaktor zwischen "wie viele Signale" und "wie
// wichtig ist der Service" erfinden.
// ---------------------------------------------------------------------------
// Auftragspunkt "keine zyklische Modulabhaengigkeit" - computeServiceBusinessImpact()
// importiert BEWUSST NICHTS aus core/service-resilience.ts (das umgekehrt
// diese Funktion aufruft, siehe dort). Die org-weite Uebersicht
// (buildBusinessImpactOverview(), die service-resilience.ts's Funktionen
// braucht) liegt deshalb in der separaten Datei
// core/business-impact-overview.ts.
import type { FullImpactAnalysis } from "./topology";
import type { Service, ServiceCriticality } from "../types/service.types";
import type { ResilienceSignal } from "../types/resilience.types";
import type { BusinessImpactFactor, BusinessImpactTier, ServiceBusinessImpact } from "../types/business-impact.types";

// Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence"
// nutzt denselben Criticality-Rang als Rausch-Filter fuer proaktive Alerts -
// EXPORTIERT statt in core/proactive-risk-alerting.ts erneut definiert.
export const CRITICALITY_RANK: Record<ServiceCriticality, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const TIER_BY_RANK: BusinessImpactTier[] = ["LOW", "MODERATE", "HIGH", "SEVERE"];

export function computeServiceBusinessImpact(input: {
  service: Service | undefined;
  impactAnalysis: FullImpactAnalysis | null;
  signals: ResilienceSignal[];
}): ServiceBusinessImpact {
  if (!input.service) {
    return {
      tier: "UNKNOWN",
      dataQuality: "UNKNOWN",
      ownCriticality: null,
      ownBusinessOwner: null,
      affectedDependentCount: 0,
      activelyImpactedDependentCount: 0,
      factors: [],
      relatedOpenIncidentIds: [],
    };
  }

  const { service, impactAnalysis, signals } = input;
  const factors: BusinessImpactFactor[] = [];
  const involvedRanks: number[] = [];

  if (signals.length > 0) {
    involvedRanks.push(CRITICALITY_RANK[service.criticality]);
    factors.push({
      kind: "OWN_SERVICE_SIGNAL",
      serviceId: service.id,
      serviceName: service.name,
      serviceCriticality: service.criticality,
      businessOwner: service.businessOwner,
      detail: `${signals.length} active resilience signal${signals.length === 1 ? "" : "s"} on this service (e.g. "${signals[0]!.title}").`,
    });
  }

  const criticalityByServiceId = new Map<number, ServiceCriticality>();
  const nameByServiceId = new Map<number, string>();
  const ownerByServiceId = new Map<number, string | null>();
  for (const s of impactAnalysis?.affectedServices ?? []) {
    criticalityByServiceId.set(s.id, s.criticality);
    nameByServiceId.set(s.id, s.name);
    ownerByServiceId.set(s.id, s.businessOwner);
  }

  const activelyImpactedServiceIds = new Set<number>();
  const relatedOpenIncidentIds: number[] = [];

  for (const incident of impactAnalysis?.related.openIncidents ?? []) {
    if (incident.serviceId === service.id) continue; // eigene Incidents sind bereits ueber signals abgedeckt.
    relatedOpenIncidentIds.push(incident.id);
    const criticality = criticalityByServiceId.get(incident.serviceId);
    if (!criticality || activelyImpactedServiceIds.has(incident.serviceId)) continue;
    activelyImpactedServiceIds.add(incident.serviceId);
    involvedRanks.push(CRITICALITY_RANK[criticality]);
    factors.push({
      kind: "DEPENDENT_OPEN_INCIDENT",
      serviceId: incident.serviceId,
      serviceName: nameByServiceId.get(incident.serviceId) ?? incident.serviceName,
      serviceCriticality: criticality,
      businessOwner: ownerByServiceId.get(incident.serviceId) ?? null,
      detail: `Open incident "${incident.title}" (${incident.severity}).`,
    });
  }

  for (const slo of impactAnalysis?.related.atRiskSlos ?? []) {
    if (slo.serviceId === service.id) continue;
    const criticality = criticalityByServiceId.get(slo.serviceId);
    if (!criticality || activelyImpactedServiceIds.has(slo.serviceId)) continue;
    activelyImpactedServiceIds.add(slo.serviceId);
    involvedRanks.push(CRITICALITY_RANK[criticality]);
    factors.push({
      kind: "DEPENDENT_AT_RISK_SLO",
      serviceId: slo.serviceId,
      serviceName: nameByServiceId.get(slo.serviceId) ?? slo.serviceName,
      serviceCriticality: criticality,
      businessOwner: ownerByServiceId.get(slo.serviceId) ?? null,
      detail: `SLO "${slo.name}" is ${slo.status}.`,
    });
  }

  for (const alert of impactAnalysis?.related.triggeredAlerts ?? []) {
    if (alert.serviceId === service.id) continue;
    const criticality = criticalityByServiceId.get(alert.serviceId);
    if (!criticality || activelyImpactedServiceIds.has(alert.serviceId)) continue;
    activelyImpactedServiceIds.add(alert.serviceId);
    involvedRanks.push(CRITICALITY_RANK[criticality]);
    factors.push({
      kind: "DEPENDENT_TRIGGERED_ALERT",
      serviceId: alert.serviceId,
      serviceName: nameByServiceId.get(alert.serviceId) ?? alert.serviceName,
      serviceCriticality: criticality,
      businessOwner: ownerByServiceId.get(alert.serviceId) ?? null,
      detail: `Alert rule "${alert.name}" is currently triggered.`,
    });
  }

  const tier: BusinessImpactTier = involvedRanks.length === 0 ? "NONE" : TIER_BY_RANK[Math.max(...involvedRanks)]!;

  return {
    tier,
    dataQuality: impactAnalysis?.truncated ? "TRUNCATED" : "COMPLETE",
    ownCriticality: service.criticality,
    ownBusinessOwner: service.businessOwner,
    affectedDependentCount: impactAnalysis?.affectedServices.length ?? 0,
    activelyImpactedDependentCount: activelyImpactedServiceIds.size,
    factors,
    relatedOpenIncidentIds,
  };
}

