import type { GraphEdge, GraphNode, IdeaData } from "@/types/graph";
import { isAttribution } from "@/types/graph";
import { footprint, type Footprint } from "@/lib/graph/geometry";
import { resolveCollisions, type Positions } from "@/lib/generation/layout";
import { hashString } from "@/lib/utils/random";

/**
 * Research galaxy layout. The research question sits at the centre, sources orbit it on
 * a ring, concepts found in one source fan outward from that source, and concepts shared
 * by several sources settle between them — so recurring ideas visibly bridge sources.
 */

type NodeLike = Pick<GraphNode, "id" | "position"> & { data: IdeaData };
type EdgeLike = Pick<GraphEdge, "source" | "target"> & { data?: { relation?: GraphEdge["data"]["relation"] } };

const X_STRETCH = 1.16;
const TAU = Math.PI * 2;

function centreOf(nodes: readonly NodeLike[]): { x: number; y: number } {
  const core = nodes.find((n) => n.data.kind === "core" && !n.data.role);
  return core ? { ...core.position } : { x: 0, y: 0 };
}

/** Concepts and claims: nodes that orbit the sources they came from. */
function sourced(n: NodeLike): boolean {
  return n.data.role === "concept" || n.data.role === "claim";
}

/** concept/claim id -> source ids, from attribution edges (falls back to concept refs or claim sources). */
export function conceptSources(nodes: readonly NodeLike[], edges: readonly EdgeLike[]): Map<string, string[]> {
  const sources = new Set(nodes.filter((n) => n.data.role === "source").map((n) => n.id));
  const map = new Map<string, string[]>();
  for (const e of edges) {
    if (!isAttribution(e.data?.relation) || !sources.has(e.target)) continue;
    map.set(e.source, [...(map.get(e.source) ?? []), e.target]);
  }
  for (const n of nodes) {
    if (!sourced(n) || map.has(n.id)) continue;
    const refs = (n.data.concept?.refs.map((r) => r.sourceId) ?? n.data.claim?.sourceIds ?? []).filter((id) => sources.has(id));
    if (refs.length) map.set(n.id, refs);
  }
  return map;
}

function ringRadius(sourceCount: number): number {
  return Math.max(430, (sourceCount * 330) / TAU);
}

function polar(centre: { x: number; y: number }, angle: number, distance: number): { x: number; y: number } {
  return { x: centre.x + Math.cos(angle) * distance * X_STRETCH, y: centre.y + Math.sin(angle) * distance };
}

/** Fans `ids` outward from `origin`, facing away from `centre`. */
function fan(ids: readonly string[], origin: { x: number; y: number }, centre: { x: number; y: number }, out: Positions): void {
  const k = ids.length;
  if (k === 0) return;
  const facing = Math.atan2(origin.y - centre.y, (origin.x - centre.x) / X_STRETCH);
  const spread = k === 1 ? 0 : Math.min((200 * Math.PI) / 180, k * 0.36);
  ids.forEach((id, i) => {
    const t = k === 1 ? 0.5 : i / (k - 1);
    const angle = facing - spread / 2 + spread * t;
    const distance = 165 + (i % 2) * 80 + (hashString(id) % 20);
    out[id] = polar(origin, angle, distance);
  });
}

/** Discovery nodes all carry a tag line (domain, type or "my idea"), so non-planets need a little more room. */
function footprints(nodes: readonly NodeLike[]): Map<string, Footprint> {
  return new Map(
    nodes.map((n) => {
      const fp = footprint(n.data.kind, n.data.label);
      return [n.id, n.data.kind === "planet" || n.data.kind === "core" ? fp : { ...fp, height: fp.height + 12, dy: fp.dy + 6 }];
    }),
  );
}

function finish(positions: Positions): Positions {
  for (const id of Object.keys(positions)) positions[id] = { x: Math.round(positions[id].x), y: Math.round(positions[id].y) };
  return positions;
}

/** Full layout for a research workspace ("Reorganize layout"). */
export function computeResearchLayout(nodes: readonly NodeLike[], edges: readonly EdgeLike[]): Positions {
  const positions: Positions = {};
  const centre = { x: 0, y: 0 };
  const core = nodes.find((n) => n.data.kind === "core" && !n.data.role);
  if (core) positions[core.id] = centre;
  const sources = nodes.filter((n) => n.data.role === "source");
  const radius = ringRadius(sources.length);
  sources.forEach((s, i) => {
    positions[s.id] = polar(centre, -Math.PI / 2 + (i / Math.max(1, sources.length)) * TAU, radius);
  });

  const bySource = conceptSources(nodes, edges);
  const exclusive = new Map<string, string[]>();
  const orphans: string[] = [];
  for (const n of nodes) {
    if (!sourced(n)) continue;
    const owners = (bySource.get(n.id) ?? []).filter((id) => positions[id]);
    if (owners.length === 0) orphans.push(n.id);
    else if (owners.length === 1) exclusive.set(owners[0], [...(exclusive.get(owners[0]) ?? []), n.id]);
    else {
      // Shared concepts sit between their sources, pulled towards the question.
      const x = owners.reduce((sum, id) => sum + positions[id].x, 0) / owners.length;
      const y = owners.reduce((sum, id) => sum + positions[id].y, 0) / owners.length;
      const jitter = (hashString(n.id) % 60) - 30;
      positions[n.id] = { x: x * 0.62 + jitter, y: y * 0.62 - jitter / 2 };
    }
  }
  for (const [sourceId, ids] of exclusive) fan(ids, positions[sourceId], centre, positions);
  orphans.forEach((id, i) => {
    positions[id] = polar(centre, (i * 2.4) % TAU, 210);
  });

  // The user's own ideas: near what they connect to, otherwise on an inner ring.
  const ideas = nodes.filter((n) => !n.data.role && n.id !== core?.id);
  ideas.forEach((n, i) => {
    const neighbours = edges.filter((e) => e.source === n.id || e.target === n.id).map((e) => (e.source === n.id ? e.target : e.source)).filter((id) => positions[id] && id !== core?.id);
    if (neighbours.length) {
      const x = neighbours.reduce((sum, id) => sum + positions[id].x, 0) / neighbours.length;
      const y = neighbours.reduce((sum, id) => sum + positions[id].y, 0) / neighbours.length;
      positions[n.id] = { x: x * 0.8, y: y * 0.8 + 70 };
    } else {
      positions[n.id] = polar(centre, Math.PI / 2 + i * 0.9, 240);
    }
  });
  for (const n of nodes) positions[n.id] ??= { ...n.position };
  resolveCollisions(positions, footprints(nodes), new Set(core ? [core.id] : []));
  return finish(positions);
}

/**
 * Positions for newly added nodes only. Existing nodes never move, so manual
 * arrangements survive every import.
 */
export function placeNewNodes(nodes: readonly NodeLike[], edges: readonly EdgeLike[], newIds: ReadonlySet<string>): Positions {
  if (newIds.size === 0) return {};
  const centre = centreOf(nodes);
  const positions: Positions = {};
  for (const n of nodes) if (!newIds.has(n.id)) positions[n.id] = { ...n.position };

  const existingSources = nodes.filter((n) => n.data.role === "source" && !newIds.has(n.id));
  const newSources = nodes.filter((n) => n.data.role === "source" && newIds.has(n.id));
  const golden = Math.PI * (3 - Math.sqrt(5));
  newSources.forEach((s, i) => {
    const index = existingSources.length + i;
    const radius = ringRadius(Math.max(8, index + 1)) + Math.floor(index / 10) * 120;
    positions[s.id] = polar(centre, -Math.PI / 2 + index * golden, radius);
  });

  const bySource = conceptSources(nodes, edges);
  const fans = new Map<string, string[]>();
  for (const n of nodes) {
    if (!newIds.has(n.id) || n.data.role === "source") continue;
    const owners = (bySource.get(n.id) ?? []).filter((id) => positions[id]);
    if (sourced(n) && owners.length === 1) {
      fans.set(owners[0], [...(fans.get(owners[0]) ?? []), n.id]);
    } else if (owners.length > 1) {
      const x = owners.reduce((sum, id) => sum + positions[id].x, 0) / owners.length;
      const y = owners.reduce((sum, id) => sum + positions[id].y, 0) / owners.length;
      positions[n.id] = { x: centre.x + (x - centre.x) * 0.62, y: centre.y + (y - centre.y) * 0.62 };
    } else {
      const neighbour = edges.find((e) => e.source === n.id || e.target === n.id);
      const other = neighbour ? (neighbour.source === n.id ? neighbour.target : neighbour.source) : null;
      const anchor = other && positions[other] ? positions[other] : centre;
      positions[n.id] = polar(anchor, (hashString(n.id) % 628) / 100, 190);
    }
  }
  for (const [sourceId, ids] of fans) fan(ids, positions[sourceId], centre, positions);
  for (const n of nodes) positions[n.id] ??= { ...centre };

  const fixed = new Set(nodes.filter((n) => !newIds.has(n.id)).map((n) => n.id));
  resolveCollisions(positions, footprints(nodes), fixed, 60);
  const result: Positions = {};
  for (const id of newIds) if (positions[id]) result[id] = positions[id];
  return finish(result);
}
