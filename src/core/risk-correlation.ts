// Phase 58 "Enterprise Operational Risk Correlation" - Bestandsanalyse:
// core/decision-context.ts (Phase 50/53/54/55/56/57) korreliert bereits
// umfassend, aber AUSSCHLIESSLICH innerhalb EINES Projekts. Wenn dieselbe
// Ursache mehrere Projekte gleichzeitig betrifft (dieselbe unhealthy
// kritische Dependency, Phase 56, oder derselbe kapazitaetsgefaehrdete
// Agent, Phase 55), zeigt bisher JEDES betroffene Projekt sein eigenes
// Signal isoliert - nichts macht sichtbar "das ist EINE Ursache, nicht N
// getrennte Probleme". Dieses Modul ist eine REINE Gruppierungs-/
// Aggregationsschicht - KEIN neues Correlation Engine, KEINE neue
// Risikoberechnung: jedes Signal stammt unveraendert aus bereits
// bestehenden Funktionen:
//   - Kandidaten-Vorfilter: core/service-resilience.ts#buildResilienceOverview()
//     (Phase 37/41, bereits gecacht) - dieselbe bounded Top-N-Technik wie
//     Phase 43/46/47/48/49/53.
//   - Dependency-Root-Cause: core/service-resilience.ts#buildServiceResilienceDetail()
//     ...signals (Phase 56's CRITICAL_DEPENDENCY_UNHEALTHY) - unveraendert
//     gruppiert nach signal.affectedEntity (der bereits vorhandenen
//     Root-Service-Identitaet).
//   - Agent-Capacity-Root-Cause: core/decision-context.ts#getActiveAgentCapacityRisk()
//     (Phase 55, jetzt exportiert) - unveraendert gruppiert nach agentId.
// Korrelation NUR ueber ECHTE, bereits bestehende Kanten (Dependency-Graph/
// Agent-Zuordnung) - NIEMALS ueber zeitliche Koinzidenz allein (Auftrag:
// "unabhaengige Ereignisse duerfen nicht falsch korreliert werden").
import { buildResilienceOverview, buildServiceResilienceDetail } from "./service-resilience";
import { getActiveAgentCapacityRisk } from "./decision-context";
import type { ResilienceOverviewRow } from "../types/resilience.types";
import type { RiskCorrelationGroup, RiskCorrelationOverview, RiskCorrelationAffectedProject } from "../types/risk-correlation.types";

export interface RiskCorrelationFilter {
  organizationId: string;
  hours: number;
  limit?: number;
}

// Dieselbe nachsichtige limit-Klemmung wie Priority Queue/Capacity Watchlist
// (Phase 43/46) statt eines harten Zod-Ablehnens.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Eine "Korrelation" braucht per Definition MINDESTENS zwei unabhaengig
// betroffene Projekte - eine einzelne betroffene Projekt-Ursache ist bereits
// vollstaendig ueber dessen eigenen Decision Context sichtbar (Phase 50/55/
// 56) und gehoert nicht zusaetzlich in diese Uebersicht (Auftragspunkt
// "unabhaengige Ereignisse duerfen nicht falsch korreliert werden" - eine
// Gruppe mit nur einem Mitglied waere keine Korrelation, nur Rauschen).
const MIN_GROUP_SIZE = 2;

function toAffectedProject(row: { projectId: string; projectName: string; resilienceStatus: RiskCorrelationAffectedProject["resilienceStatus"] }): RiskCorrelationAffectedProject {
  return { projectId: row.projectId, projectName: row.projectName, resilienceStatus: row.resilienceStatus };
}

export async function buildRiskCorrelation(filter: RiskCorrelationFilter): Promise<RiskCorrelationOverview> {
  const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const overview = await buildResilienceOverview({ organizationId: filter.organizationId, hours: filter.hours });
  // Nur nicht-gesunde Projekte koennen ueberhaupt eine korrelierte Ursache
  // haben - dieselbe Vorfilterung wie Priority Queue (Phase 43).
  const candidates = overview.rows
    .filter((row) => row.resilienceStatus !== "HEALTHY" && row.resilienceStatus !== "UNKNOWN")
    .slice(0, limit);

  const [details, agentRisks] = await Promise.all([
    Promise.all(candidates.map((row) => buildServiceResilienceDetail(row.projectId, filter.hours))),
    Promise.all(candidates.map((row) => getActiveAgentCapacityRisk(row.projectId))),
  ]);

  const dependencyGroups = new Map<number, RiskCorrelationGroup>();
  const agentGroups = new Map<string, RiskCorrelationGroup>();

  candidates.forEach((row: ResilienceOverviewRow, index) => {
    const detail = details[index];
    if (detail) {
      for (const signal of detail.signals) {
        if (signal.type !== "CRITICAL_DEPENDENCY_UNHEALTHY" || signal.affectedEntity.kind !== "SERVICE") continue;
        const rootId = signal.affectedEntity.id as number;
        const group =
          dependencyGroups.get(rootId) ??
          ({
            rootCauseKind: "DEPENDENCY",
            rootCauseId: String(rootId),
            rootCauseName: signal.affectedEntity.name,
            severity: signal.severity === "CRITICAL" ? "CRITICAL" : "WARNING",
            affectedProjects: [],
            recommendedAction: `Investigate and remediate "${signal.affectedEntity.name}" - resolving this one dependency would likely resolve every project listed below simultaneously.`,
          } satisfies RiskCorrelationGroup);
        // Ein Signal je Projekt/Root-Kombination (buildResilienceSignalsFromDetail
        // erzeugt hoechstens einen CRITICAL_DEPENDENCY_UNHEALTHY-Eintrag pro
        // unhealthy kritischer Dependency) - kein Duplikat-Schutz noetig.
        if (!group.affectedProjects.some((p) => p.projectId === row.projectId)) {
          group.affectedProjects.push(toAffectedProject({ projectId: row.projectId, projectName: row.projectName, resilienceStatus: row.resilienceStatus }));
        }
        if (signal.severity === "CRITICAL") group.severity = "CRITICAL";
        dependencyGroups.set(rootId, group);
      }
    }

    const agentRisk = agentRisks[index];
    if (agentRisk) {
      const group =
        agentGroups.get(agentRisk.agentId) ??
        ({
          rootCauseKind: "AGENT_CAPACITY",
          rootCauseId: agentRisk.agentId,
          rootCauseName: agentRisk.agentName,
          severity: "WARNING",
          affectedProjects: [],
          recommendedAction: agentRisk.recommendedAction ?? `Investigate capacity on monitoring agent "${agentRisk.agentName}" - it serves every project listed below.`,
        } satisfies RiskCorrelationGroup);
      if (!group.affectedProjects.some((p) => p.projectId === row.projectId)) {
        group.affectedProjects.push(toAffectedProject({ projectId: row.projectId, projectName: row.projectName, resilienceStatus: row.resilienceStatus }));
      }
      agentGroups.set(agentRisk.agentId, group);
    }
  });

  const groups = [...dependencyGroups.values(), ...agentGroups.values()]
    .filter((g) => g.affectedProjects.length >= MIN_GROUP_SIZE)
    .sort((a, b) => b.affectedProjects.length - a.affectedProjects.length || a.rootCauseName.localeCompare(b.rootCauseName));

  return {
    organizationId: filter.organizationId,
    windowHours: filter.hours,
    generatedAt: new Date().toISOString(),
    candidatesEvaluated: candidates.length,
    groups,
  };
}
