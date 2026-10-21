import { describe, expect, it } from "vitest";
import type { IdeaNode } from "@/types/graph";
import { isAttribution } from "@/types/graph";
import type { SourceInfo } from "@/types/research";
import { analyzeLocally } from "@/lib/discovery/analyze/local";
import type { SourceAnalysis } from "@/lib/discovery/analyze/types";
import { computeResearchLayout } from "@/lib/discovery/layout";
import { isUnreviewed, mergeSourceAnalysis, previewSourceRemoval, removeSource } from "@/lib/discovery/merge";
import { computeEmphasis, searchNodes } from "@/lib/graph/emphasis";
import * as ops from "@/lib/graph/ops";
import { filterSets } from "@/lib/store/graphSlice";

// Original fixture prose written for these tests.
const CORAL = `Coral reefs and ocean warming

Coral reefs are among the most diverse ecosystems on Earth. Coral bleaching happens when warm water stresses corals and they expel the algae living in their tissue. Marine heatwaves have become more frequent, and coral bleaching events now return before reefs can recover.

Scientists argue that ocean warming is the main cause of mass coral bleaching. Ocean acidification also weakens coral skeletons, because more carbon dioxide dissolves into seawater. The Great Barrier Reef suffered severe coral bleaching in 2016 and again in 2017.

However, some researchers dispute how quickly reefs can adapt. Coral bleaching does not always kill a reef, and heat-tolerant corals may spread. Marine heatwaves and ocean acidification together still threaten coral reefs worldwide.`;

const FISHERIES = `Fisheries on warming reefs

Coral reefs support fisheries that feed millions of people. When coral bleaching kills reef-building corals, fish lose shelter and fisheries decline. Overfishing removes grazing fish, which allows algae to smother coral reefs.

Ocean warming shifts fish populations towards cooler water. The Great Barrier Reef tourism industry also depends on healthy coral reefs. Marine protected areas can help fisheries recover, although they cannot stop ocean warming.`;

const QUESTION = "What causes coral reef decline?";

function sourceInfo(url: string, title: string): SourceInfo {
  return { url, key: url, domain: new URL(url).hostname, title, status: "pending", origin: "url" };
}

function baseState(): ops.GraphState {
  const nodes: IdeaNode[] = [
    { id: "q", type: "idea", position: { x: 0, y: 0 }, data: { label: QUESTION, notes: "", category: "question", kind: "core", seed: 1 } },
    { id: "s1", type: "idea", position: { x: 0, y: -430 }, data: { label: "Coral", notes: "", category: "note", kind: "planet", seed: 2, role: "source", source: sourceInfo("https://reefs.example/coral", "Coral reefs and ocean warming") } },
    { id: "s2", type: "idea", position: { x: 400, y: 200 }, data: { label: "Fisheries", notes: "", category: "note", kind: "planet", seed: 3, role: "source", source: sourceInfo("https://fish.example/reefs", "Fisheries on warming reefs") } },
  ];
  return { nodes, edges: [] };
}

function stripEllipsis(passage: string): string {
  return passage.replace(/…$/, "");
}

function importBoth(): { state: ops.GraphState; a1: SourceAnalysis; a2: SourceAnalysis } {
  const a1 = analyzeLocally({ text: CORAL, title: "Coral reefs and ocean warming", question: QUESTION });
  const a2 = analyzeLocally({ text: FISHERIES, title: "Fisheries on warming reefs", question: QUESTION });
  let state = baseState();
  state = mergeSourceAnalysis(state, "s1", a1, { title: "Coral reefs and ocean warming" }, QUESTION);
  state = mergeSourceAnalysis(state, "s2", a2, { title: "Fisheries on warming reefs" }, QUESTION);
  return { state, a1, a2 };
}

describe("local concept extraction", () => {
  const analysis = analyzeLocally({ text: CORAL, title: "Coral reefs and ocean warming", question: QUESTION });

  it("finds recurring concepts, and says it is approximate", () => {
    const labels = analysis.concepts.map((c) => c.label.toLowerCase());
    expect(analysis.provider).toBe("local");
    expect(analysis.approximate).toBe(true);
    expect(labels).toContain("coral bleaching");
    expect(labels).toContain("ocean acidification");
    expect(labels).toContain("marine heatwaves");
    // Cut-off phrases and subject-verb fragments are rejected.
    expect(labels.some((l) => /stresses|removes|kills/.test(l))).toBe(false);
    expect(analysis.concepts.length).toBeLessThanOrEqual(14);
  });

  it("only ever quotes the source: summary sentences and passages are verbatim", () => {
    const flat = CORAL.replace(/\s+/g, " ");
    expect(analysis.summaryKind).toBe("extractive");
    for (const sentence of analysis.summary.split(/(?<=[.!?])\s+/)) expect(flat).toContain(sentence);
    for (const concept of analysis.concepts) {
      expect(concept.passages.length).toBeGreaterThan(0);
      for (const passage of concept.passages) expect(flat).toContain(stripEllipsis(passage));
    }
    for (const passage of analysis.keyPassages) expect(flat).toContain(stripEllipsis(passage));
    for (const relation of analysis.relations) expect(flat).toContain(stripEllipsis(relation.evidence));
  });

  it("flags contrasting language and types recurring dates, without inventing facts", () => {
    const text = "Critics dispute the role of inflation in the crisis. Inflation rose sharply in 1923 and again in 1923 after the currency collapsed. Inflation destroyed savings, and the government printed money. The crisis of 1923 ended when a new currency replaced the old one. Historians still debate how inflation shaped politics.";
    const result = analyzeLocally({ text, title: "", question: "Why did inflation happen?" });
    const inflation = result.concepts.find((c) => c.label.toLowerCase() === "inflation");
    expect(inflation?.tension).toBe(true);
    const date = result.concepts.find((c) => c.type === "date");
    expect(date?.label).toBe("1923");
    for (const c of analysis.concepts.filter((x) => x.type === "date")) expect(CORAL).toContain(c.label);
  });

  it("returns nothing (rather than guessing) for text without usable sentences", () => {
    const empty = analyzeLocally({ text: "Home\n\nMenu\n\nContact", title: "", question: QUESTION });
    expect(empty.concepts).toEqual([]);
    expect(empty.summary).toBe("");
  });
});

describe("source attribution and concept merging", () => {
  it("attributes every concept to the sources it came from", () => {
    const { state } = importBoth();
    const concepts = state.nodes.filter((n) => n.data.role === "concept");
    expect(concepts.length).toBeGreaterThan(5);
    for (const concept of concepts) {
      const refs = concept.data.concept?.refs ?? [];
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        // A navigable attribution edge concept -> source exists for every reference.
        expect(state.edges.some((e) => e.source === concept.id && e.target === ref.sourceId && isAttribution(e.data?.relation))).toBe(true);
      }
    }
    const s1 = state.nodes.find((n) => n.id === "s1");
    expect(s1?.data.source?.status).toBe("ready");
    expect(s1?.data.source?.summaryKind).toBe("extractive");
  });

  it("merges a concept found in several sources into one node instead of duplicating it", () => {
    const { state } = importBoth();
    const bleaching = state.nodes.filter((n) => n.data.label.toLowerCase() === "coral reefs");
    expect(bleaching).toHaveLength(1);
    expect(bleaching[0].data.concept?.refs.map((r) => r.sourceId).sort()).toEqual(["s1", "s2"]);
    expect(bleaching[0].data.kind).toBe("planet");
    const relations = state.edges.filter((e) => e.source === bleaching[0].id && isAttribution(e.data?.relation)).map((e) => e.data?.relation);
    expect(relations.sort()).toEqual(["extracted", "mentions"]);
    const labels = state.nodes.filter((n) => n.data.role === "concept").map((n) => n.data.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps attribution apart from semantic links, and marks automatic links unreviewed with evidence", () => {
    const { state } = importBoth();
    const semantic = state.edges.filter((e) => !isAttribution(e.data?.relation));
    expect(semantic.length).toBeGreaterThan(0);
    for (const edge of semantic) {
      expect(edge.data?.auto).toBe(true);
      expect(edge.data?.review).toBe("unreviewed");
      expect(edge.data?.evidence?.text.length).toBeGreaterThan(10);
      expect(["s1", "s2"]).toContain(edge.data?.evidence?.sourceId);
    }
    expect(semantic.every(isUnreviewed)).toBe(true);
    expect(ops.toGraph(state).edges.every((e) => e.source !== e.target)).toBe(true);
  });

  it("re-processing a source is idempotent", () => {
    const { state, a1 } = importBoth();
    const again = mergeSourceAnalysis(state, "s1", a1, {}, QUESTION);
    expect(again.nodes.length).toBe(state.nodes.length);
    expect(again.edges.length).toBe(state.edges.length);
    expect(again.stats.created).toBe(0);
    // Concepts keep their identity and position, so manual arrangements survive re-analysis.
    expect(again.nodes.map((n) => `${n.id}@${n.position.x},${n.position.y}`).sort()).toEqual(state.nodes.map((n) => `${n.id}@${n.position.x},${n.position.y}`).sort());
  });

  it("never moves existing nodes when new ones arrive", () => {
    const { state } = importBoth();
    const before = new Map(baseState().nodes.map((n) => [n.id, n.position]));
    for (const [id, position] of before) expect(state.nodes.find((n) => n.id === id)?.position).toEqual(position);
    const positions = state.nodes.map((n) => `${n.position.x},${n.position.y}`);
    expect(new Set(positions).size).toBe(positions.length);
  });
});

describe("removing a source", () => {
  it("removes what only it supported, keeps shared concepts and your notes and links", () => {
    const { state } = importBoth();
    const exclusive = state.nodes.filter((n) => n.data.concept?.refs.length === 1 && n.data.concept.refs[0].sourceId === "s1");
    expect(exclusive.length).toBeGreaterThan(1);
    const noted = exclusive[0];
    const linked = exclusive[1];
    let edited: ops.GraphState = { ...state, nodes: ops.updateNodeData(state.nodes, noted.id, { notes: "Check this" }) };
    const idea = ops.addStandalone(edited, { x: 50, y: 50 }, { label: "My hunch", category: "idea" });
    edited = idea;
    const link = ops.connect(edited, idea.createdId as string, linked.id, "believes", { review: "hypothesis", rationale: "Because." });
    if (!link.ok) throw new Error("link failed");
    edited = { ...edited, edges: link.edges };

    const preview = previewSourceRemoval(edited, "s1");
    const result = removeSource(edited, "s1");
    const ids = new Set(result.nodes.map((n) => n.id));
    expect(ids.has("s1")).toBe(false);
    expect(ids.has(noted.id)).toBe(true);
    expect(ids.has(linked.id)).toBe(true);
    expect(result.nodes.find((n) => n.id === noted.id)?.data.concept?.refs).toEqual([]);
    expect(result.keptConceptIds.sort()).toEqual([noted.id, linked.id].sort());
    expect(preview.conceptsKept).toBe(2);
    expect(preview.conceptsRemoved).toBe(exclusive.length - 2);
    for (const other of exclusive.slice(2)) expect(ids.has(other.id)).toBe(false);
    // Shared concepts stay, minus this source's passages.
    const bleaching = result.nodes.find((n) => n.data.label.toLowerCase() === "coral reefs");
    expect(bleaching?.data.concept?.refs.map((r) => r.sourceId)).toEqual(["s2"]);
    expect(bleaching?.data.kind).toBe("star");
    // No dangling links and no evidence pointing at the removed source.
    for (const e of result.edges) {
      expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
      expect(e.data?.evidence?.sourceId).not.toBe("s1");
    }
    expect(result.edges.some((e) => e.data?.review === "hypothesis" && e.data.rationale === "Because.")).toBe(true);
  });
});

describe("research views", () => {
  it("filters dim non-matching nodes and highlight a selection's neighbourhood", () => {
    const { state } = importBoth();
    const sources = filterSets(state.nodes, state.edges, "sources");
    expect([...(sources?.nodes ?? [])].sort()).toEqual(["s1", "s2"]);
    const emphasis = computeEmphasis({ nodes: state.nodes, edges: state.edges, hoverId: null, selectedId: null, focusId: null, searchMatches: null, filter: sources });
    expect(emphasis.nodes.s1).toBeUndefined();
    expect(emphasis.nodes.q).toBe("x");
    const unreviewed = filterSets(state.nodes, state.edges, "unreviewed");
    expect(unreviewed?.edges.size).toBe(state.edges.filter(isUnreviewed).length);
    expect(filterSets(state.nodes, state.edges, "all")).toBeNull();

    const selected = computeEmphasis({ nodes: state.nodes, edges: state.edges, hoverId: null, selectedId: "s1", focusId: null, searchMatches: null, selectionFocus: true });
    const fromS1 = state.edges.filter((e) => e.target === "s1").map((e) => e.source);
    for (const id of fromS1) expect(selected.nodes[id]).toContain("h");
    expect(selected.nodes.s2?.startsWith("s")).toBe(true);
  });

  it("searches source domains and summaries as well as titles", () => {
    const { state } = importBoth();
    expect(searchNodes(state.nodes, "fish.example")).toEqual(["s2"]);
    const summary = state.nodes.find((n) => n.id === "s1")?.data.source?.summary ?? "";
    const phrase = summary.split(" ").slice(3, 7).join(" ");
    expect(phrase.length).toBeGreaterThan(5);
    expect(searchNodes(state.nodes, phrase)).toContain("s1");
  });

  it("lays out sources around the question with shared concepts between them", () => {
    const { state } = importBoth();
    const positions = computeResearchLayout(state.nodes, state.edges);
    expect(positions.q).toEqual({ x: 0, y: 0 });
    const shared = state.nodes.find((n) => n.data.label.toLowerCase() === "coral reefs") as IdeaNode;
    const d = (id: string) => Math.hypot(positions[id].x, positions[id].y);
    expect(d(shared.id)).toBeLessThan(Math.max(d("s1"), d("s2")));
    for (const p of Object.values(positions)) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});
