import { describe, expect, it } from "vitest";
import type { Graph } from "@/types/graph";
import { generateMap } from "@/lib/generation";
import { computeEmphasis, searchNodes } from "@/lib/graph/emphasis";
import { emptyHistory, record, redo, undo } from "@/lib/graph/history";
import * as ops from "@/lib/graph/ops";
import { expectValidGraph } from "./helpers";

function state() {
  return ops.fromGraph(generateMap("topic", "How the human brain learns").graph);
}

function idOf(s: ops.GraphState, label: string): string {
  const node = s.nodes.find((n) => n.data.label === label);
  if (!node) throw new Error(`missing ${label}`);
  return node.id;
}

describe("graph operations", () => {
  it("adds a child with a unique id, label and a link to its parent", () => {
    const s = state();
    const parent = idOf(s, "Memory systems");
    const first = ops.addChild(s, parent);
    const second = first && ops.addChild(first, parent);
    expect(first?.createdId).toBeDefined();
    expect(second?.createdId).not.toBe(first?.createdId);
    const labels = second?.nodes.map((n) => n.data.label) ?? [];
    expect(labels).toContain("New idea");
    expect(labels).toContain("New idea 2");
    expect(second?.edges.some((e) => e.source === parent && e.target === first?.createdId)).toBe(true);
    expectValidGraph(ops.toGraph(second as ops.GraphState));
  });

  it("prevents self-links and duplicate connections in either direction", () => {
    const s = state();
    const a = idOf(s, "Sleep");
    const b = idOf(s, "Interleaving");
    expect(ops.connect(s, a, a)).toEqual({ ok: false, reason: "self" });
    const first = ops.connect(s, a, b, "supports");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const next = { nodes: s.nodes, edges: first.edges };
    expect(ops.connect(next, a, b)).toEqual({ ok: false, reason: "duplicate" });
    expect(ops.connect(next, b, a)).toEqual({ ok: false, reason: "duplicate" });
    expect(ops.connect(next, a, "missing")).toEqual({ ok: false, reason: "missing" });
  });

  it("removes incident edges when deleting nodes, keeping references valid", () => {
    const s = state();
    const target = idOf(s, "Learning strategies");
    const next = ops.removeNodes(s, [target]);
    expect(next.nodes.some((n) => n.id === target)).toBe(false);
    expect(next.edges.some((e) => e.source === target || e.target === target)).toBe(false);
    expectValidGraph(ops.toGraph(next));
  });

  it("edits node data and relationships immutably", () => {
    const s = state();
    const id = idOf(s, "Sleep");
    const nodes = ops.updateNodeData(s.nodes, id, { label: "Deep sleep", category: "impact" });
    expect(nodes.find((n) => n.id === id)?.data).toMatchObject({ label: "Deep sleep", category: "impact" });
    expect(s.nodes.find((n) => n.id === id)?.data.label).toBe("Sleep");

    const edge = s.edges[0];
    const changed = ops.setEdgeRelation(s.edges, edge.id, "contrasts");
    expect(changed[0].data?.relation).toBe("contrasts");
    const reversed = ops.reverseEdge(s.edges, edge.id);
    expect([reversed[0].source, reversed[0].target]).toEqual([edge.target, edge.source]);
    expect(ops.removeEdges(s.edges, [edge.id])).toHaveLength(s.edges.length - 1);
  });

  it("duplicates a node next to the original and reconnects it to the same parent", () => {
    const s = state();
    const id = idOf(s, "Sleep");
    const change = ops.duplicateNode(s, id);
    const copy = change?.nodes.find((n) => n.id === change.createdId);
    expect(copy?.data.label).toBe("Sleep copy");
    const parent = s.edges.find((e) => e.target === id)?.source;
    expect(change?.edges.some((e) => e.source === parent && e.target === copy?.id)).toBe(true);
    expectValidGraph(ops.toGraph(change as ops.GraphState));
  });

  it("repairs malformed graphs", () => {
    const broken = {
      nodes: [
        { id: "a", position: { x: Number.NaN, y: 1 }, data: { label: "", notes: 5, category: "nope", kind: "giant", seed: "x" } },
        { id: "a", position: { x: 0, y: 0 }, data: { label: "dupe", notes: "", category: "idea", kind: "star", seed: 1 } },
        { id: "b", position: { x: 3, y: 4 }, data: { label: "B", notes: "", category: "goal", kind: "planet", seed: 2 } },
      ],
      edges: [
        { id: "e1", source: "a", target: "b", data: { relation: "causes" } },
        { id: "e2", source: "b", target: "a", data: { relation: "causes" } },
        { id: "e3", source: "a", target: "ghost", data: { relation: "related" } },
        { id: "e4", source: "b", target: "b", data: { relation: "weird" } },
      ],
    } as unknown as Graph;
    const fixed = ops.sanitizeGraph(broken);
    expect(fixed.nodes).toHaveLength(2);
    expect(fixed.nodes[0].data).toMatchObject({ label: "Untitled idea", notes: "", category: "idea", kind: "star" });
    expect(fixed.nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(fixed.edges.map((e) => e.id)).toEqual(["e1"]);
  });
});

describe("history", () => {
  it("undoes and redoes edits in order", () => {
    const s0 = state();
    const g0 = ops.toGraph(s0);
    const s1 = ops.addChild(s0, idOf(s0, "Expertise")) as ops.GraphState;
    let history = record(emptyHistory(), g0);
    const g1 = ops.toGraph(s1);
    const s2 = ops.removeNodes(s1, [idOf(s1, "Sleep")]);
    history = record(history, g1);
    const g2 = ops.toGraph(s2);

    const back1 = undo(history, g2);
    expect(back1?.graph).toEqual(g1);
    const back2 = undo(back1?.history ?? emptyHistory(), g1);
    expect(back2?.graph).toEqual(g0);
    expect(undo(back2?.history ?? emptyHistory(), g0)).toBeNull();

    const forward = redo(back2?.history ?? emptyHistory(), g0);
    expect(forward?.graph).toEqual(g1);
    const forward2 = redo(forward?.history ?? emptyHistory(), g1);
    expect(forward2?.graph).toEqual(g2);
    expect(redo(forward2?.history ?? emptyHistory(), g2)).toBeNull();
  });

  it("drops the redo branch after a new edit and respects the size limit", () => {
    const g = ops.toGraph(state());
    let history = record(emptyHistory(), g);
    const undone = undo(history, g);
    history = record(undone?.history ?? emptyHistory(), g);
    expect(history.future).toHaveLength(0);
    let capped = emptyHistory();
    for (let i = 0; i < 10; i++) capped = record(capped, g, 4);
    expect(capped.past).toHaveLength(4);
  });
});

describe("emphasis and search", () => {
  it("finds ideas by title or notes, title matches first", () => {
    const s = state();
    const matches = searchNodes(s.nodes, "memory");
    expect(matches[0]).toBe(idOf(s, "Memory systems"));
    expect(matches).toContain(idOf(s, "Working memory"));
    expect(searchNodes(s.nodes, "dopamine")).toContain(idOf(s, "Curiosity and dopamine"));
    expect(searchNodes(s.nodes, "   ")).toEqual([]);
  });

  it("fades everything outside the focused neighbourhood", () => {
    const s = state();
    const focus = idOf(s, "Brain state");
    const emphasis = computeEmphasis({ nodes: s.nodes, edges: s.edges, hoverId: null, selectedId: focus, focusId: focus, searchMatches: null });
    expect(emphasis.nodes[focus]).toBeUndefined();
    expect(emphasis.nodes[idOf(s, "Sleep")]).toBeUndefined();
    expect(emphasis.nodes[idOf(s, "Interleaving")]).toBe("f");
    const none = computeEmphasis({ nodes: s.nodes, edges: s.edges, hoverId: null, selectedId: null, focusId: null, searchMatches: null });
    expect(none.active).toBe(false);
  });
});
