import { pool } from "./pool";
import type { DependencyCriticality, DependencyType, ServiceDependency } from "../types/service.types";

interface ServiceDependencyRow {
  id: number;
  organization_id: string;
  source_service_id: number;
  target_service_id: number;
  dependency_type: string;
  criticality: string;
  description: string | null;
  created_by: string | null;
  created_at: string | Date;
}

const DEPENDENCY_COLUMNS = `
  id, organization_id, source_service_id, target_service_id, dependency_type, criticality, description, created_by, created_at
`;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: ServiceDependencyRow): ServiceDependency {
  return {
    // Siehe ausfuehrlicher Kommentar in db/services.repository.ts#mapRow -
    // dieselbe Normalisierung, hier zusaetzlich fuer die beiden
    // Fremdschluessel (source/target), die in core/topology.ts als
    // Set<number>-Schluessel verwendet werden.
    id: Number(row.id),
    organizationId: row.organization_id,
    sourceServiceId: Number(row.source_service_id),
    targetServiceId: Number(row.target_service_id),
    dependencyType: row.dependency_type as DependencyType,
    criticality: row.criticality as DependencyCriticality,
    description: row.description,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
  };
}

export async function listDependenciesForService(serviceId: number): Promise<ServiceDependency[]> {
  const { rows } = await pool.query<ServiceDependencyRow>(
    `SELECT ${DEPENDENCY_COLUMNS} FROM service_dependencies WHERE source_service_id = $1 ORDER BY id ASC`,
    [serviceId],
  );
  return rows.map(mapRow);
}

// "Dependents" - wer haengt VON diesem Service ab (Kante zeigt AUF ihn).
export async function listDependentsForService(serviceId: number): Promise<ServiceDependency[]> {
  const { rows } = await pool.query<ServiceDependencyRow>(
    `SELECT ${DEPENDENCY_COLUMNS} FROM service_dependencies WHERE target_service_id = $1 ORDER BY id ASC`,
    [serviceId],
  );
  return rows.map(mapRow);
}

export async function listDependenciesForOrganization(organizationId: string): Promise<ServiceDependency[]> {
  const { rows } = await pool.query<ServiceDependencyRow>(
    `SELECT ${DEPENDENCY_COLUMNS} FROM service_dependencies WHERE organization_id = $1 ORDER BY id ASC`,
    [organizationId],
  );
  return rows.map(mapRow);
}

// Auftragspunkt 24 "Performance" - EINE Abfrage fuer mehrere Quell-Services
// gleichzeitig (statt einer Einzelabfrage je Traversierungs-Ebene, N+1),
// verwendet von core/topology.ts (Impact-Analyse, jede Graph-Ebene).
export async function listDependentsForServices(serviceIds: number[]): Promise<ServiceDependency[]> {
  if (serviceIds.length === 0) return [];
  const { rows } = await pool.query<ServiceDependencyRow>(
    `SELECT ${DEPENDENCY_COLUMNS} FROM service_dependencies WHERE target_service_id = ANY($1::bigint[])`,
    [serviceIds],
  );
  return rows.map(mapRow);
}

export async function getDependencyById(id: number): Promise<ServiceDependency | undefined> {
  const { rows } = await pool.query<ServiceDependencyRow>(`SELECT ${DEPENDENCY_COLUMNS} FROM service_dependencies WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function dependencyExists(sourceServiceId: number, targetServiceId: number): Promise<boolean> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM service_dependencies WHERE source_service_id = $1 AND target_service_id = $2`,
    [sourceServiceId, targetServiceId],
  );
  return rows.length > 0;
}

export async function countDependenciesForOrganization(organizationId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM service_dependencies WHERE organization_id = $1`, [organizationId]);
  return Number(rows[0]?.count ?? 0);
}

// Auftragspunkt 4/7 "Dependency Validation" - erkennt, ob das Hinzufuegen
// von source->target einen Zyklus schliessen wuerde (d.h. ob target
// bereits (transitiv, begrenzt auf maxDepth) von source abhaengt - dann
// wuerde source->target einen Ring bilden). Reines Lesen, keine Mutation -
// der Aufrufer entscheidet, ob ein erkannter Zyklus blockiert oder nur im
// UI markiert wird (Auftragspunkt 7: "Zyklen muessen zumindest erkannt
// werden").
export async function wouldCreateCycle(sourceServiceId: number, targetServiceId: number, maxDepth: number): Promise<boolean> {
  const visited = new Set<number>([sourceServiceId]);
  let frontier = [targetServiceId];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    if (frontier.includes(sourceServiceId)) return true;
    for (const id of frontier) visited.add(id);
    const { rows } = await pool.query<{ target_service_id: number }>(
      `SELECT DISTINCT target_service_id FROM service_dependencies WHERE source_service_id = ANY($1::bigint[])`,
      [frontier],
    );
    // Phase 25 - echter, live beim Zyklus-Test gefundener Bug: der
    // pg-Treiber liefert die BIGINT-Spalte target_service_id zur Laufzeit
    // als STRING (kein registrierter Typ-Parser fuer OID 20/int8), obwohl
    // die Zeile als "number" typisiert ist - dieselbe, bereits mehrfach in
    // diesem Projekt dokumentierte Bug-Klasse (siehe z.B. db/services.
    // repository.ts#mapRow), hier aber unbemerkt geblieben, weil diese
    // Funktion (anders als die uebrigen Repository-Funktionen) OHNE eine
    // mapRow()-Zwischenschicht direkt mit dem rohen Query-Ergebnis
    // weiterarbeitet. Ohne Number() blieb sowohl "!visited.has(id)" als
    // auch "id === sourceServiceId" IMMER auf der falschen Seite (String
    // "85" !== Number 85 in beiden Richtungen) - wouldCreateCycle() gab
    // dadurch fuer JEDEN echten Zyklus mit mehr als einer Kante bislang
    // "false" zurueck, obwohl der Zyklus real im Graphen existierte.
    frontier = rows.map((r) => Number(r.target_service_id)).filter((id) => !visited.has(id) || id === sourceServiceId);
    if (frontier.includes(sourceServiceId)) return true;
  }
  return false;
}

export interface CreateDependencyInput {
  organizationId: string;
  sourceServiceId: number;
  targetServiceId: number;
  dependencyType: DependencyType;
  criticality?: DependencyCriticality;
  description?: string | null;
  createdBy?: string | null;
}

// Auftragspunkt 21 "Quotas" - race-sicher, identisches Muster zu
// createServiceIfUnderQuota()/createSloIfUnderQuota().
//
// Production Audit (nach Phase 27/28) - echter, live mit 5 parallelen
// echten Requests reproduzierter Bug: der Route-Handler prueft
// dependencyExists() VOR diesem Aufruf, aber dieser Pre-Check und der
// INSERT unten liegen nicht in derselben Transaktion/demselben Lock - zwei
// gleichzeitige Anfragen fuer dieselbe Kante koennen beide den Pre-Check
// passieren. Ohne Abfangen hier verletzte der zweite INSERT dann
// "service_dependencies_source_service_id_target_service_id_key" (23505)
// und riss als ungefangene Exception bis zum globalen Error-Handler durch
// -> roher 500 "Interner Serverfehler" statt eines sauberen 409 (live
// beobachtet: 4 von 5 parallelen Anfragen bekamen 500 statt 409). Fix
// identisch zum bereits bestehenden Muster in
// db/incidents.repository.ts#reopenIncident: 23505 abfangen, "CONFLICT"
// zurueckgeben statt zu werfen.
export async function createDependencyIfUnderQuota(input: CreateDependencyInput, maxDependencies: number): Promise<ServiceDependency | null | "CONFLICT"> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM organizations WHERE id = $1 FOR UPDATE`, [input.organizationId]);
    const { rows: countRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM service_dependencies WHERE organization_id = $1`,
      [input.organizationId],
    );
    if (Number(countRows[0]?.count ?? 0) >= maxDependencies) {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows } = await client.query<ServiceDependencyRow>(
      `INSERT INTO service_dependencies (organization_id, source_service_id, target_service_id, dependency_type, criticality, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${DEPENDENCY_COLUMNS}`,
      [
        input.organizationId,
        input.sourceServiceId,
        input.targetServiceId,
        input.dependencyType,
        input.criticality ?? "CRITICAL",
        input.description ?? null,
        input.createdBy ?? null,
      ],
    );
    await client.query("COMMIT");
    const row = rows[0];
    if (!row) {
      throw new Error("Dependency konnte nicht angelegt werden");
    }
    return mapRow(row);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      return "CONFLICT";
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteDependency(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM service_dependencies WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
