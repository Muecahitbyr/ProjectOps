import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { EmptyState } from "../common/EmptyState";
import { healthStatusColors } from "../../theme/statusColors";
import type { Service, ServiceDependency } from "../../types/service.types";

const NODE_WIDTH = 160;
const NODE_HEIGHT = 44;
const COLUMN_GAP = 220;
const ROW_GAP = 70;
const PADDING = 40;

// Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
// Intelligence" Auftragspunkt 12 "Topology Graph" - bewusst KEINE neue
// Graph-Bibliothek (z.B. react-flow/cytoscape/d3), da im Projekt noch keine
// vorhanden ist und der Auftrag explizit "moeglichst leichte, wartbare
// Loesung" verlangt: ein einfaches, deterministisches Ebenen-Layout
// (schichtweise nach laengster Abhaengigkeitskette) als reines SVG, ohne
// zusaetzliche Abhaengigkeit. Layer 0 = Blaetter (keine ausgehenden Kanten,
// z.B. "Stripe"/"Database"), hoehere Layer = Services, die (transitiv)
// davon abhaengen.
function computeLayers(nodes: Service[], edges: ServiceDependency[]): Map<number, number> {
  const outgoing = new Map<number, number[]>();
  for (const node of nodes) outgoing.set(node.id, []);
  for (const edge of edges) {
    outgoing.get(edge.sourceServiceId)?.push(edge.targetServiceId);
  }

  const layer = new Map<number, number>();
  for (const node of nodes) layer.set(node.id, 0);

  // Iterativ bis zu |nodes| Runden (bounded - Auftragspunkt 24), stabilisiert
  // sich fuer jeden zyklenfreien Teilgraphen; Knoten in einem Zyklus bleiben
  // auf ihrem zuletzt stabilen Wert stehen (kein Endlos-Loop).
  for (let round = 0; round < nodes.length; round++) {
    let changed = false;
    for (const node of nodes) {
      const targets = outgoing.get(node.id) ?? [];
      if (targets.length === 0) continue;
      const maxTargetLayer = Math.max(...targets.map((t) => layer.get(t) ?? 0));
      const desired = maxTargetLayer + 1;
      if ((layer.get(node.id) ?? 0) < desired) {
        layer.set(node.id, desired);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

export function TopologyGraphView({
  nodes,
  edges,
  onSelectNode,
  highlightedIds,
}: {
  nodes: Service[];
  edges: ServiceDependency[];
  onSelectNode: (id: number) => void;
  highlightedIds?: Set<number>;
}) {
  const theme = useTheme();
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const layout = useMemo(() => {
    const layers = computeLayers(nodes, edges);
    const byLayer = new Map<number, Service[]>();
    for (const node of nodes) {
      const l = layers.get(node.id) ?? 0;
      if (!byLayer.has(l)) byLayer.set(l, []);
      byLayer.get(l)!.push(node);
    }
    const positions = new Map<number, { x: number; y: number }>();
    const maxLayer = Math.max(0, ...[...byLayer.keys()]);
    for (const [l, servicesInLayer] of byLayer) {
      servicesInLayer.forEach((service, row) => {
        // Hoehere Layer (mehr "downstream Abhaengigkeit von ihm") stehen
        // weiter links, Blaetter rechts - liest sich wie "A -> B -> Stripe".
        const x = PADDING + (maxLayer - l) * COLUMN_GAP;
        const y = PADDING + row * ROW_GAP;
        positions.set(service.id, { x, y });
      });
    }
    const width = PADDING * 2 + (maxLayer + 1) * COLUMN_GAP;
    const height = PADDING * 2 + Math.max(...[...byLayer.values()].map((s) => s.length), 1) * ROW_GAP;
    return { positions, width, height };
  }, [nodes, edges]);

  if (nodes.length === 0) {
    return <EmptyState message="No services in this scope yet." minHeight={300} />;
  }

  const relevantEdgeSet = hoveredId !== null ? new Set(edges.filter((e) => e.sourceServiceId === hoveredId || e.targetServiceId === hoveredId).map((e) => e.id)) : null;

  return (
    <Box sx={{ overflowX: "auto", width: "100%" }}>
      <svg width={layout.width} height={layout.height} style={{ display: "block", minWidth: "100%" }}>
        <defs>
          <marker id="topology-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={theme.palette.text.secondary} />
          </marker>
        </defs>
        {edges.map((edge) => {
          const from = layout.positions.get(edge.sourceServiceId);
          const to = layout.positions.get(edge.targetServiceId);
          if (!from || !to) return null;
          const x1 = from.x + NODE_WIDTH;
          const y1 = from.y + NODE_HEIGHT / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_HEIGHT / 2;
          const dimmed = relevantEdgeSet ? !relevantEdgeSet.has(edge.id) : false;
          return (
            <line
              key={edge.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={edge.criticality === "CRITICAL" ? healthStatusColors.critical : theme.palette.divider}
              strokeWidth={edge.criticality === "CRITICAL" ? 1.5 : 1}
              strokeDasharray={edge.criticality === "OPTIONAL" ? "4 3" : undefined}
              opacity={dimmed ? 0.15 : 0.8}
              markerEnd="url(#topology-arrow)"
            />
          );
        })}
        {nodes.map((node) => {
          const pos = layout.positions.get(node.id);
          if (!pos) return null;
          const highlighted = highlightedIds?.has(node.id);
          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{ cursor: "pointer" }}
              onClick={() => onSelectNode(node.id)}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={8}
                fill={theme.palette.background.paper}
                stroke={highlighted ? healthStatusColors.critical : theme.palette.divider}
                strokeWidth={highlighted ? 2 : 1}
              />
              <circle cx={16} cy={NODE_HEIGHT / 2} r={5} fill={node.projectId ? healthStatusColors.healthy : "#6b7280"} />
              <text x={30} y={NODE_HEIGHT / 2 + 4} fontSize={12} fill={theme.palette.text.primary}>
                {node.name.length > 18 ? `${node.name.slice(0, 17)}…` : node.name}
              </text>
            </g>
          );
        })}
      </svg>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        Solid line = critical dependency, dashed = optional. Hover a node to highlight its edges, click to open its detail page.
      </Typography>
    </Box>
  );
}
