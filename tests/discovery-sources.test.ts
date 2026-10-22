import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { IdeaData, IdeaNode as IdeaNodeType, MindMap } from "@/types/graph";
import type { SearchResult, SourceInfo } from "@/types/research";
import { IdeaNode } from "@/components/graph/IdeaNode";
import { analyzeLocally } from "@/lib/discovery/analyze/local";
import { buildResearchExport } from "@/lib/discovery/exportData";
import { MAX_CLAIMS_PER_SOURCE, mergeSourceAnalysis, removeSource } from "@/lib/discovery/merge";
import { abstractOnly, canUseAbstract, isImportable, pickTopResults, sourceFromResult, sourceKeys } from "@/lib/discovery/sources";
import * as ops from "@/lib/graph/ops";
import { parseMap, serializeMap } from "@/lib/storage/maps";
import { expectValidGraph } from "./helpers";

// Original fixture prose written for these tests.
const REEF = `Coral reefs and ocean warming

Coral reefs are among the most diverse ecosystems on Earth. Coral bleaching happens when warm water stresses corals and they expel the algae living in their tissue. Marine heatwaves have become more frequent, and coral bleaching events now return before reefs can recover.

Scientists argue that ocean warming is the main cause of mass coral bleaching. Ocean acidification also weakens coral skeletons, because more carbon dioxide dissolves into seawater. The Great Barrier Reef suffered severe coral bleaching in 2016 and again in 2017.

However, some researchers dispute how quickly coral reefs can adapt. Coral bleaching does not always kill a reef, and heat-tolerant corals may spread. Marine heatwaves and ocean acidification together still threaten coral reefs worldwide.`;

const FISH = `Fisheries on warming reefs

Coral reefs support fisheries that feed millions of people. When coral bleaching kills reef-building corals, fish lose shelter and fisheries decline. Overfishing removes grazing fish, which allows algae to smother coral reefs.

Researchers concluded that ocean warming shifts fish populations towards cooler water. Scientists argue that ocean warming is the main cause of mass coral bleaching. Marine protected areas can help fisheries recover, although they cannot stop ocean warming.`;

const QUESTION = "What causes coral reef decline?";

function result(partial: Partial<SearchResult> & Pick<SearchResult, "url" | "domain">): SearchResult {
  return { id: `r_${partial.url}`, title: "A result", key: partial.url.replace(/^https?:\/\//, ""), snippet: "", provider: "brave", rank: 0, ...partial };
}

function source(url: string, title: string, extra: Partial<SourceInfo> = {}): SourceInfo {
  return { url, key: url.replace(/^https?:\/\//, ""), domain: new URL(url).hostname, title, status: "pending", origin: "search", ...extra };
}

function baseState(): ops.GraphState {
  const nodes: IdeaNodeType[] = [
    { id: "q", type: "idea", position: { x: 0, y: 0 }, data: { label: QUESTION, notes: "", category: "question", kind: "core", seed: 1 } },
    { id: "s1", type: "idea", position: { x: 0, y: -430 }, data: { label: "Reef", notes: "", category: "note", kind: "planet", seed: 2, role: "source", source: source("https://journal.example/reef", "Coral reefs and ocean warming", { category: "academic", sourceRole: "primary", providers: ["openalex"] }) } },
    { id: "s2", type: "idea", position: { x: 400, y: 200 }, data: { label: "Fish", notes: "", category: "note", kind: "planet", seed: 3, role: "source", source: source("https://news.example/fish", "Fisheries on warming reefs", { category: "news", sourceRole: "secondary", providers: ["gdelt"] }) } },
  ];
  return { nodes, edges: [] };
}

function importBoth(): ops.GraphState {
  let state = baseState();
  state = mergeSourceAnalysis(state, "s1", analyzeLocally({ text: REEF, title: "Coral reefs and ocean warming", question: QUESTION }), { textOrigin: "fetched" }, QUESTION);
  state = mergeSourceAnalysis(state, "s2", analyzeLocally({ text: FISH, title: "Fisheries on warming reefs", question: QUESTION }), { textOrigin: "fetched" }, QUESTION);
  return state;
}

describe("results become sources", () => {
  it("carries provider metadata over without inventing missing fields", () => {
    const info = sourceFromResult(
      result({ url: "https://arxiv.org/abs/2111.08018", domain: "arxiv.org", title: "Entanglement dynamics", provider: "arxiv", providers: ["arxiv", "openalex"], category: "academic", sourceRole: "primary", authors: ["A. Potter"], doi: "10.1/x", abstract: "x".repeat(250), preprint: true, altKeys: ["doi:10.1/x", "arxiv:2111.08018"], signals: ["Indexed by arXiv"] }),
      "quantum circuits",
    );
    expect(info).toMatchObject({ status: "pending", origin: "search", query: "quantum circuits", category: "academic", authors: ["A. Potter"], doi: "10.1/x", providers: ["arxiv", "openalex"], abstractFrom: "arxiv", preprint: true });
    expect("publishedAt" in info).toBe(false);
    expect("venue" in info).toBe(false);
    expect(sourceKeys(info)).toEqual(expect.arrayContaining(["arxiv.org/abs/2111.08018", "doi:10.1/x", "arxiv:2111.08018"]));
  });

  it("uses an index abstract only when the page cannot be read, and says why", () => {
    const withAbstract = source("https://doi.org/10.1/x", "Paper", { abstract: "An abstract that is long enough to analyse. ".repeat(6) });
    expect(canUseAbstract(withAbstract, { code: "forbidden", message: "The site refused access." })).toBe(true);
    expect(canUseAbstract(withAbstract, { code: "paywalled", message: "Paywalled." })).toBe(true);
    // A page that does not exist is not stood in for, nor is a page without an abstract.
    expect(canUseAbstract(withAbstract, { code: "not_found", message: "Gone." })).toBe(false);
    expect(canUseAbstract(source("https://doi.org/10.1/y", "Paper"), { code: "forbidden", message: "No." })).toBe(false);
    expect(abstractOnly(source("https://example.org/paper.pdf", "PDF", { abstract: "a".repeat(220) }))).toBe(true);
    expect(abstractOnly(source("https://example.org/paper.pdf", "PDF"))).toBe(false);
  });

  it("imports the top results from different sites and never re-imports a known work", () => {
    const results = [
      result({ url: "https://a.example/1", domain: "a.example" }),
      result({ url: "https://a.example/2", domain: "a.example" }),
      result({ url: "https://b.example/report.pdf", domain: "b.example", unsupported: "PDF" }),
      result({ url: "https://c.example/paper.pdf", domain: "c.example", unsupported: "PDF", abstract: "c".repeat(240) }),
      result({ url: "https://d.example/doi-copy", domain: "d.example", altKeys: ["doi:10.1/known"] }),
      result({ url: "https://e.example/1", domain: "e.example" }),
    ];
    const keys = new Set(["doi:10.1/known"]);
    expect(pickTopResults(results, keys, 8).map((r) => r.domain)).toEqual(["a.example", "c.example", "e.example"]);
    expect(isImportable(results[4], keys)).toBe(false);
    expect(pickTopResults(results, keys, 2)).toHaveLength(2);
  });
});

describe("claims and provenance in the galaxy", () => {
  it("links each quoted claim to the source it comes from and the concepts it mentions", () => {
    const state = importBoth();
    expectValidGraph(ops.toGraph(state));
    const claims = state.nodes.filter((n) => n.data.role === "claim");
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      const info = claim.data.claim!;
      expect(info.sourceIds.length).toBeGreaterThan(0);
      for (const sourceId of info.sourceIds) {
        // Verbatim: the claim text appears in a source it is attributed to.
        expect([REEF, FISH].some((t) => t.includes(info.text))).toBe(true);
        expect(state.edges.some((e) => e.source === claim.id && e.target === sourceId && e.data?.relation === "extracted")).toBe(true);
      }
      const evidence = state.edges.filter((e) => e.source === claim.id && e.data?.relation === "evidence");
      expect(evidence.length).toBeGreaterThan(0);
      for (const e of evidence) {
        const concept = state.nodes.find((n) => n.id === e.target);
        expect(concept?.data.role).toBe("concept");
        expect(info.text.toLowerCase()).toContain(concept!.data.label.toLowerCase());
      }
    }
    for (const sourceId of ["s1", "s2"]) expect(claims.filter((c) => c.data.claim!.sourceIds.includes(sourceId)).length).toBeLessThanOrEqual(MAX_CLAIMS_PER_SOURCE);
    // Every concept is attributed to the sources whose text it came from.
    for (const concept of state.nodes.filter((n) => n.data.role === "concept")) {
      for (const ref of concept.data.concept!.refs) expect(state.edges.some((e) => e.source === concept.id && e.target === ref.sourceId)).toBe(true);
    }
  });

  /** Both sources state the same argument sentence (syndicated or quoted text). */
  function importSharedClaim(): { state: ops.GraphState; text: string } {
    let state = mergeSourceAnalysis(baseState(), "s1", analyzeLocally({ text: REEF, title: "Coral reefs and ocean warming", question: QUESTION }), { textOrigin: "fetched" }, QUESTION);
    const text = state.nodes.find((n) => n.data.role === "claim")!.data.claim!.text;
    const fish = analyzeLocally({ text: FISH, title: "Fisheries on warming reefs", question: QUESTION });
    state = mergeSourceAnalysis(state, "s2", { ...fish, keyPassages: [text] }, { textOrigin: "fetched" }, QUESTION);
    return { state, text };
  }

  it("shares one claim node when two sources state the same sentence", () => {
    const { state, text } = importSharedClaim();
    const shared = state.nodes.filter((n) => n.data.claim?.text === text);
    expect(shared).toHaveLength(1);
    expect(shared[0].data.claim!.sourceIds.sort()).toEqual(["s1", "s2"]);
    expect(state.edges.filter((e) => e.source === shared[0].id && e.data?.relation === "extracted").map((e) => e.target).sort()).toEqual(["s1", "s2"]);
  });

  it("does not duplicate nodes or links when research is rerun", () => {
    const once = importBoth();
    let again = mergeSourceAnalysis(once, "s1", analyzeLocally({ text: REEF, title: "Coral reefs and ocean warming", question: QUESTION }), { textOrigin: "fetched" }, QUESTION);
    again = mergeSourceAnalysis(again, "s2", analyzeLocally({ text: FISH, title: "Fisheries on warming reefs", question: QUESTION }), { textOrigin: "fetched" }, QUESTION);
    expect(again.nodes.map((n) => n.id).sort()).toEqual(once.nodes.map((n) => n.id).sort());
    expect(again.edges).toHaveLength(once.edges.length);
    expectValidGraph(ops.toGraph(again));
  });

  it("removing a source removes the claims only it supported", () => {
    const { state, text } = importSharedClaim();
    const onlyS1 = mergeSourceAnalysis(baseState(), "s1", analyzeLocally({ text: REEF, title: "Coral reefs and ocean warming", question: QUESTION }), { textOrigin: "fetched" }, QUESTION);
    const removed = removeSource(onlyS1, "s1");
    expect(removed.nodes.some((n) => n.data.role === "claim")).toBe(false);
    const result = removeSource(state, "s1");
    expect(result.nodes.some((n) => n.data.claim?.sourceIds.includes("s1"))).toBe(false);
    expect(result.nodes.find((n) => n.data.claim?.text === text)?.data.claim?.sourceIds).toEqual(["s2"]);
    expectValidGraph(ops.toGraph(result));
  });
});

describe("persistence of multi-source research", () => {
  function workspace(): MindMap {
    const graph = ops.toGraph(importBoth());
    return {
      id: "m_multi",
      title: "What causes coral reef decline",
      createdAt: 1,
      updatedAt: 2,
      starred: false,
      source: { mode: "topic", input: QUESTION },
      workspace: "discovery",
      research: {
        question: QUESTION,
        notes: "",
        analysis: "local",
        search: {
          query: QUESTION,
          scope: "web",
          provider: "multi",
          fetchedAt: 5,
          nextOffset: 1,
          facets: ["Science"],
          queries: ["coral reef decline"],
          outcomes: [
            { id: "openalex", label: "OpenAlex", status: "ok", count: 10, queries: ["coral reef decline"] },
            { id: "gdelt", label: "GDELT news", status: "rate_limited", count: 0, message: "GDELT is rate-limiting this server.", queries: ["coral reef decline"] },
          ],
          results: [{ id: "r1", title: "Reef paper", url: "https://doi.org/10.1/reef", key: "doi.org/10.1/reef", domain: "doi.org", snippet: "", provider: "openalex", providers: ["openalex", "brave"], rank: 0, category: "academic", sourceRole: "primary", citedBy: 12, altKeys: ["doi:10.1/reef"], signals: ["Indexed by OpenAlex"] }],
        },
      },
      ...graph,
    };
  }

  it("round-trips sources, claims, metadata and provider outcomes exactly", () => {
    const map = workspace();
    map.nodes = map.nodes.map((n) => (n.id === "s1" ? { ...n, data: { ...n.data, source: { ...n.data.source!, textOrigin: "abstract", accessError: { code: "paywalled", message: "The page is behind a paywall." }, abstract: "An abstract.", abstractFrom: "openalex", authors: ["R. Coral"], venue: "Reef Science", doi: "10.1/reef", citedBy: 12 } } } : n));
    const restored = parseMap(serializeMap(map));
    expect(restored).toEqual(map);
    expect(restored?.nodes.filter((n) => n.data.role === "claim").length).toBeGreaterThan(0);
  });

  it("drops malformed new fields instead of failing to open", () => {
    const map = workspace();
    const raw = JSON.parse(serializeMap(map));
    raw.map.nodes[1].data.source.category = "made-up";
    raw.map.nodes[1].data.source.providers = ["brave", "nope"];
    raw.map.nodes.push({ id: "bad", position: { x: 0, y: 0 }, data: { label: "Broken claim", notes: "", category: "note", kind: "moon", seed: 1, role: "claim", claim: { sourceIds: ["s1"] } } });
    const restored = parseMap(JSON.stringify(raw));
    expect(restored?.nodes[1].data.source?.category).toBeUndefined();
    expect(restored?.nodes[1].data.source?.providers).toEqual(["brave"]);
    expect(restored?.nodes.find((n) => n.id === "bad")?.data.role).toBeUndefined();
  });

  it("exports claims as quoted content only when passages are included", () => {
    const map = workspace();
    const withPassages = buildResearchExport(map, map.nodes, map.edges, { includePassages: true, includeNotes: false });
    const without = buildResearchExport(map, map.nodes, map.edges, { includePassages: false, includeNotes: false });
    expect(withPassages.claims.length).toBeGreaterThan(0);
    expect(withPassages.claims[0]).toHaveProperty("text");
    expect(without.claims[0]).not.toHaveProperty("text");
    expect(withPassages.sources.find((s) => s.id === "s1")).toMatchObject({ sourceType: "academic", evidenceRole: "primary", foundBy: ["openalex"] });
  });
});

describe("galaxy rendering", () => {
  function render(id: string, data: IdeaData): string {
    const props = { id, data, type: "idea", selected: false, dragging: false, draggable: true, selectable: true, deletable: true, isConnectable: true, zIndex: 0, positionAbsoluteX: 0, positionAbsoluteY: 0 };
    return renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(IdeaNode, props as never)));
  }

  it("draws sources as satellites tagged with their kind and site", () => {
    const html = render("s1", { label: "Quantum entanglement", notes: "", category: "note", kind: "planet", seed: 4, role: "source", source: source("https://arxiv.org/abs/0702225", "Quantum entanglement", { status: "ready", category: "academic", domain: "arxiv.org" }) });
    expect(html).toContain('data-role="source"');
    expect(html).toContain('data-category="academic"');
    expect(html).toContain("Research · arxiv.org");
    expect(html).toContain("<svg");
  });

  it("draws claims as their own bodies with provenance", () => {
    const html = render("k1", { label: "Scientists argue that ocean warming is the main cause", notes: "", category: "note", kind: "moon", seed: 5, role: "claim", claim: { text: "Scientists argue that ocean warming is the main cause of mass coral bleaching.", sourceIds: ["s1", "s2"], review: "unreviewed" } });
    expect(html).toContain('data-role="claim"');
    expect(html).toContain("Claim");
    expect(html).toContain("2 sources");
  });
});
