import { describe, expect, it } from "vitest";
import type { Graph } from "@/types/graph";
import { generateMap } from "@/lib/generation";
import { computeLayout, findOpenPosition } from "@/lib/generation/layout";
import { footprint } from "@/lib/graph/geometry";

function overlaps(graph: Graph, positions: Record<string, { x: number; y: number }>): number {
  let count = 0;
  for (let i = 0; i < graph.nodes.length; i++) {
    for (let j = i + 1; j < graph.nodes.length; j++) {
      const a = graph.nodes[i];
      const b = graph.nodes[j];
      const fa = footprint(a.data.kind, a.data.label);
      const fb = footprint(b.data.kind, b.data.label);
      const pa = positions[a.id];
      const pb = positions[b.id];
      const dx = Math.abs(pa.x - pb.x);
      const dy = Math.abs(pa.y + fa.dy - (pb.y + fb.dy));
      if (dx < (fa.width + fb.width) / 2 - 1 && dy < (fa.height + fb.height) / 2 - 1) count++;
    }
  }
  return count;
}

describe("layout", () => {
  it("returns finite, non-overlapping positions with the core at the origin", () => {
    for (const [mode, input] of [
      ["topic", "How the human brain learns"],
      ["topic", "Building a startup from scratch"],
      ["topic", "Tidal energy"],
    ] as const) {
      const { graph } = generateMap(mode, input);
      const positions = computeLayout(graph);
      expect(Object.keys(positions)).toHaveLength(graph.nodes.length);
      for (const p of Object.values(positions)) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
      const core = graph.nodes.find((n) => n.data.kind === "core");
      expect(positions[core?.id ?? ""]).toEqual({ x: 0, y: 0 });
      expect(overlaps(graph, positions)).toBe(0);
    }
  });

  it("keeps children close to their parent branch", () => {
    const { graph } = generateMap("topic", "How the human brain learns");
    const positions = computeLayout(graph);
    const byLabel = (label: string) => graph.nodes.find((n) => n.data.label === label)?.id ?? "";
    const parent = positions[byLabel("Learning strategies")];
    const child = positions[byLabel("Spaced repetition")];
    const otherBranch = positions[byLabel("Neuroplasticity")];
    const near = Math.hypot(parent.x - child.x, parent.y - child.y);
    const far = Math.hypot(otherBranch.x - child.x, otherBranch.y - child.y);
    expect(near).toBeLessThan(far);
  });

  it("lays out disconnected islands and empty graphs", () => {
    const { graph } = generateMap("topic", "Tidal energy");
    const island: Graph = {
      nodes: [
        ...graph.nodes,
        { id: "x1", position: { x: 0, y: 0 }, data: { label: "Lonely idea", notes: "", category: "idea", kind: "star", seed: 1 } },
        { id: "x2", position: { x: 0, y: 0 }, data: { label: "Its friend", notes: "", category: "idea", kind: "star", seed: 2 } },
      ],
      edges: [...graph.edges, { id: "ex", source: "x1", target: "x2", data: { relation: "related" } }],
    };
    const positions = computeLayout(island);
    expect(overlaps(island, positions)).toBe(0);
    expect(computeLayout({ nodes: [], edges: [] })).toEqual({});
  });

  it("finds an open spot for new ideas without moving existing ones", () => {
    const { graph } = generateMap("topic", "How the human brain learns");
    const spot = findOpenPosition(graph.nodes, { x: 0, y: 0 }, 0, "star", "New idea");
    const fp = footprint("star", "New idea");
    for (const node of graph.nodes) {
      const other = footprint(node.data.kind, node.data.label);
      const separate =
        Math.abs(node.position.x - spot.x) >= (fp.width + other.width) / 2 || Math.abs(node.position.y + other.dy - (spot.y + fp.dy)) >= (fp.height + other.height) / 2;
      expect(separate).toBe(true);
    }
  });
});
