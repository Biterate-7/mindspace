import type { Graph, GraphNode, NodeKind } from "@/types/graph";
import { footprint, type Footprint } from "@/lib/graph/geometry";
import { createRng, hashString } from "@/lib/utils/random";

/**
 * Deterministic "planetary system" layout.
 *
 * The core sits at the origin. Each first-level idea becomes a system whose own
 * children fan outward around it, so related ideas stay clustered. Systems are spaced
 * around the core in proportion to their size, then a collision pass removes overlaps.
 */

export type Positions = Record<string, { x: number; y: number }>;

interface Tree {
  root: string;
  children: Map<string, string[]>;
}

const TAU = Math.PI * 2;
const X_STRETCH = 1.16;

function buildAdjacency(graph: Graph): Map<string, Array<{ other: string; order: number }>> {
  const adjacency = new Map<string, Array<{ other: string; order: number }>>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  graph.edges.forEach((edge, order) => {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target) || edge.source === edge.target) return;
    adjacency.get(edge.source)?.push({ other: edge.target, order });
    adjacency.get(edge.target)?.push({ other: edge.source, order });
  });
  return adjacency;
}

/** Spanning tree from `root`. Parents are chosen through the earliest edge, which keeps generated hierarchies intact. */
function spanningTree(root: string, adjacency: Map<string, Array<{ other: string; order: number }>>, nodeOrder: Map<string, number>): { tree: Tree; reached: Set<string> } {
  const depth = new Map<string, number>([[root, 0]]);
  const queue = [root];
  while (queue.length) {
    const current = queue.shift() as string;
    for (const { other } of adjacency.get(current) ?? []) {
      if (!depth.has(other)) {
        depth.set(other, (depth.get(current) ?? 0) + 1);
        queue.push(other);
      }
    }
  }
  const children = new Map<string, string[]>();
  for (const id of depth.keys()) children.set(id, []);
  for (const [id, d] of depth) {
    if (id === root) continue;
    let parent: string | null = null;
    let bestOrder = Infinity;
    for (const { other, order } of adjacency.get(id) ?? []) {
      if (depth.get(other) === d - 1 && order < bestOrder) {
        bestOrder = order;
        parent = other;
      }
    }
    if (parent) children.get(parent)?.push(id);
  }
  for (const list of children.values()) list.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
  return { tree: { root, children }, reached: new Set(depth.keys()) };
}

function pickRoot(nodes: GraphNode[], adjacency: Map<string, Array<{ other: string; order: number }>>): string {
  const core = nodes.find((n) => n.data.kind === "core");
  if (core) return core.id;
  let best = nodes[0].id;
  let bestDegree = -1;
  for (const node of nodes) {
    const degree = adjacency.get(node.id)?.length ?? 0;
    if (degree > bestDegree) {
      best = node.id;
      bestDegree = degree;
    }
  }
  return best;
}

/** Places a subtree as a fan pointing along `direction`, relative to the parent position. */
function placeFan(tree: Tree, id: string, origin: { x: number; y: number }, direction: number, depth: number, out: Positions, rnd: () => number): void {
  const kids = tree.children.get(id) ?? [];
  const k = kids.length;
  if (k === 0) return;
  const baseDistance = depth === 1 ? 138 + Math.min(100, Math.max(0, k - 4) * 13) : 112 + Math.min(64, Math.max(0, k - 3) * 11);
  const perChild = depth === 1 ? 0.7 : 0.6;
  const maxSpread = depth === 1 ? (290 * Math.PI) / 180 : (200 * Math.PI) / 180;
  const spread = k === 1 ? 0 : Math.min(maxSpread, k * perChild);
  kids.forEach((kid, i) => {
    const t = k === 1 ? 0.5 : i / (k - 1);
    const jitter = (rnd() - 0.5) * (k > 1 ? spread / k : 0.3) * 0.35;
    const angle = direction - spread / 2 + spread * t + jitter;
    const distance = baseDistance * (0.94 + rnd() * 0.12) + (k > 5 && i % 2 === 1 ? 58 : 0);
    const position = { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
    out[kid] = position;
    placeFan(tree, kid, position, angle, depth + 1, out, rnd);
  });
}


function layoutTree(tree: Tree, nodeById: Map<string, GraphNode>, seed: number): Positions {
  const rnd = createRng(seed);
  const positions: Positions = { [tree.root]: { x: 0, y: 0 } };
  const systems = tree.children.get(tree.root) ?? [];
  if (systems.length === 0) return positions;

  // Measure each system in its own frame (facing angle 0) to know how much room it needs.
  const local = systems.map((id) => {
    const out: Positions = { [id]: { x: 0, y: 0 } };
    placeFan(tree, id, { x: 0, y: 0 }, 0, 1, out, createRng(hashString(id) ^ seed));
    let radius = 70;
    for (const [nodeId, p] of Object.entries(out)) {
      const fp = footprint(nodeById.get(nodeId)?.data.kind ?? "star", nodeById.get(nodeId)?.data.label ?? "");
      radius = Math.max(radius, Math.hypot(p.x, p.y) + Math.max(fp.width, fp.height) * 0.45);
    }
    return { id, out, radius };
  });

  const total = local.reduce((sum, s) => sum + s.radius, 0);
  const maxRadius = Math.max(...local.map((s) => s.radius));
  const ringRadius = Math.max(250, (total * 0.98) / Math.PI, 140 + maxRadius * (systems.length > 1 ? 1 : 0.6));
  const start = -Math.PI / 2 + (rnd() - 0.5) * 0.5;
  let cursor = start;

  for (const system of local) {
    const share = (system.radius / total) * TAU;
    const angle = systems.length === 1 ? start : cursor + share / 2 + (rnd() - 0.5) * share * 0.12;
    cursor += share;
    const distance = ringRadius * (0.95 + rnd() * 0.1);
    const center = { x: Math.cos(angle) * distance * X_STRETCH, y: Math.sin(angle) * distance };
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const [id, p] of Object.entries(system.out)) {
      positions[id] = {
        x: center.x + (p.x * cos - p.y * sin) * 1.08,
        y: center.y + (p.x * sin + p.y * cos),
      };
    }
  }
  return positions;
}

/** Pushes overlapping footprints apart. Nodes listed in `fixed` never move. */
export function resolveCollisions(positions: Positions, footprints: Map<string, Footprint>, fixed: ReadonlySet<string>, iterations = 80, margin = 12): void {
  const ids = Object.keys(positions);
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        const fa = footprints.get(a);
        const fb = footprints.get(b);
        if (!fa || !fb) continue;
        const pa = positions[a];
        const pb = positions[b];
        const dx = pb.x - pa.x;
        const dy = pb.y + fb.dy - (pa.y + fa.dy);
        const overlapX = (fa.width + fb.width) / 2 + margin - Math.abs(dx);
        const overlapY = (fa.height + fb.height) / 2 + margin - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        moved = true;
        const aFixed = fixed.has(a);
        const bFixed = fixed.has(b);
        if (aFixed && bFixed) continue;
        const share = aFixed ? 1 : bFixed ? 0 : 0.5;
        // Resolve along the axis needing the smaller push, nudging diagonally for a softer result.
        if (overlapX / Math.max(1, fa.width + fb.width) < overlapY / Math.max(1, fa.height + fb.height)) {
          const push = (overlapX + 1) * (dx >= 0 ? 1 : -1);
          pb.x += push * share;
          pa.x -= push * (1 - share);
        } else {
          const push = (overlapY + 1) * (dy >= 0 ? 1 : -1);
          pb.y += push * share;
          pa.y -= push * (1 - share);
        }
      }
    }
    if (!moved) break;
  }
}

/** Computes a full layout for any graph: generated trees, edited graphs and disconnected islands. */
export function computeLayout(graph: Graph, seed = 7): Positions {
  if (graph.nodes.length === 0) return {};
  const adjacency = buildAdjacency(graph);
  const nodeOrder = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const positions: Positions = {};

  const root = pickRoot(graph.nodes, adjacency);
  const { tree, reached } = spanningTree(root, adjacency, nodeOrder);
  Object.assign(positions, layoutTree(tree, nodeById, seed));

  // Islands: lay out each disconnected component and stack them to the right of the main galaxy.
  const bounds = boundsOf(positions);
  let offsetY = bounds.minY;
  const placed = new Set(reached);
  for (const node of graph.nodes) {
    if (placed.has(node.id)) continue;
    const members = reachableFrom(node.id, adjacency);
    const componentRoot = pickRoot(graph.nodes.filter((n) => members.has(n.id)), adjacency);
    const component = spanningTree(componentRoot, adjacency, nodeOrder);
    const local = layoutTree(component.tree, nodeById, seed ^ hashString(componentRoot));
    const localBounds = boundsOf(local);
    const dx = bounds.maxX + 260 - localBounds.minX;
    const dy = offsetY - localBounds.minY;
    for (const [id, p] of Object.entries(local)) positions[id] = { x: p.x + dx, y: p.y + dy };
    offsetY += localBounds.maxY - localBounds.minY + 200;
    component.reached.forEach((id) => placed.add(id));
  }

  const footprints = new Map<string, Footprint>();
  for (const node of graph.nodes) footprints.set(node.id, footprint(node.data.kind, node.data.label));
  resolveCollisions(positions, footprints, new Set([root]));

  for (const id of Object.keys(positions)) {
    positions[id] = { x: Math.round(positions[id].x), y: Math.round(positions[id].y) };
  }
  return positions;
}

function reachableFrom(start: string, adjacency: Map<string, Array<{ other: string; order: number }>>): Set<string> {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const current = stack.pop() as string;
    for (const { other } of adjacency.get(current) ?? []) {
      if (!seen.has(other)) {
        seen.add(other);
        stack.push(other);
      }
    }
  }
  return seen;
}

export function boundsOf(positions: Positions): { minX: number; minY: number; maxX: number; maxY: number } {
  const values = Object.values(positions);
  if (values.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return {
    minX: Math.min(...values.map((p) => p.x)),
    minY: Math.min(...values.map((p) => p.y)),
    maxX: Math.max(...values.map((p) => p.x)),
    maxY: Math.max(...values.map((p) => p.y)),
  };
}

export function applyLayout(graph: Graph, seed?: number): Graph {
  const positions = computeLayout(graph, seed);
  return {
    nodes: graph.nodes.map((n) => ({ ...n, position: positions[n.id] ?? n.position })),
    edges: graph.edges,
  };
}

/**
 * Finds an open spot for a new node near `anchor`, preferring the direction `angle`.
 * Used when adding ideas so existing positions are never disturbed.
 */
export function findOpenPosition(
  nodes: ReadonlyArray<{ id: string; position: { x: number; y: number }; data: { kind: NodeKind; label: string } }>,
  anchor: { x: number; y: number },
  angle: number,
  kind: NodeKind,
  label: string,
): { x: number; y: number } {
  const fp = footprint(kind, label);
  const others = nodes.map((n) => ({ p: n.position, f: footprint(n.data.kind, n.data.label) }));
  const collides = (x: number, y: number) =>
    others.some(({ p, f }) => Math.abs(p.x - x) < (f.width + fp.width) / 2 + 10 && Math.abs(p.y + f.dy - (y + fp.dy)) < (f.height + fp.height) / 2 + 10);
  for (const distance of [170, 230, 300, 380, 470]) {
    for (let step = 0; step < 16; step++) {
      const offset = (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * (Math.PI / 9);
      const a = angle + offset;
      const x = anchor.x + Math.cos(a) * distance * X_STRETCH;
      const y = anchor.y + Math.sin(a) * distance;
      if (!collides(x, y)) return { x: Math.round(x), y: Math.round(y) };
    }
  }
  return { x: Math.round(anchor.x + Math.cos(angle) * 560), y: Math.round(anchor.y + Math.sin(angle) * 560) };
}
