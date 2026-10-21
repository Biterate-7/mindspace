import { describe, expect, it } from "vitest";
import type { IdeaNode, MindMap } from "@/types/graph";
import { analyzeLocally } from "@/lib/discovery/analyze/local";
import { contentHash, createMemoryContentStore } from "@/lib/discovery/contentStore";
import { buildResearchExport, sourceListMarkdown } from "@/lib/discovery/exportData";
import { mergeSourceAnalysis } from "@/lib/discovery/merge";
import { sanitizeLinkData } from "@/lib/discovery/sanitize";
import { generateMap } from "@/lib/generation";
import * as ops from "@/lib/graph/ops";
import { createMemoryDriver } from "@/lib/storage/driver";
import { MapRepository, metaOf, parseMap, serializeMap } from "@/lib/storage/maps";

const TEXT = `Tide pools and their visitors

Tide pools form when the sea retreats and leaves water trapped between rocks. Sea stars, anemones and small fish live in tide pools and must survive changing temperature and salinity. Tide pools are easy to damage, because visitors often step on anemones or move rocks.

Marine biologists argue that tide pools are early warning systems for coastal change. Warmer water and pollution stress anemones and sea stars first. Rangers ask visitors to leave tide pools as they found them.`;

function researchMap(): MindMap {
  const nodes: IdeaNode[] = [
    { id: "q", type: "idea", position: { x: 0, y: 0 }, data: { label: "Why do tide pools matter?", notes: "", category: "question", kind: "core", seed: 1 } },
    {
      id: "s1",
      type: "idea",
      position: { x: 0, y: -430 },
      data: { label: "Tide pools", notes: "Good overview", category: "note", kind: "planet", seed: 2, role: "source", source: { url: "https://coast.example/tide-pools", key: "coast.example/tide-pools", domain: "coast.example", title: "Tide pools and their visitors", status: "pending", origin: "search", query: "tide pools", publishedAt: "2022-06-01", publishedFrom: "search", snippet: "Snippet from search" } },
    },
  ];
  const analysis = analyzeLocally({ text: TEXT, title: "Tide pools and their visitors", question: "Why do tide pools matter?" });
  const merged = mergeSourceAnalysis({ nodes, edges: [] }, "s1", analysis, { retrievedAt: 1700000000000, wordCount: 120, textOrigin: "fetched" }, "Why do tide pools matter?");
  const graph = ops.toGraph(merged);
  return {
    id: "m_research",
    title: "Why do tide pools matter",
    createdAt: 1,
    updatedAt: 2,
    starred: false,
    source: { mode: "topic", input: "Why do tide pools matter?" },
    workspace: "discovery",
    research: {
      question: "Why do tide pools matter?",
      notes: "Look for long-term monitoring data.",
      analysis: "local",
      search: { query: "tide pools", scope: "web", provider: "brave", fetchedAt: 5, nextOffset: 10, results: [{ id: "r1", title: "Tide pools", url: "https://coast.example/tide-pools", key: "coast.example/tide-pools", domain: "coast.example", snippet: "s", provider: "brave", rank: 0 }] },
    },
    viewport: { x: 1, y: 2, zoom: 0.5 },
    ...graph,
  };
}

describe("research persistence", () => {
  it("round-trips a research workspace exactly: sources, concepts, evidence, reviews and search", () => {
    const map = researchMap();
    const concept = map.nodes.find((n) => n.data.role === "concept");
    expect(concept?.data.concept?.refs[0].passages.length).toBeGreaterThan(0);
    const restored = parseMap(serializeMap(map));
    expect(restored).toEqual(map);
    expect(metaOf(map).workspace).toBe("discovery");
  });

  it("saves, lists and reloads research workspaces next to ordinary maps", () => {
    const repo = new MapRepository(createMemoryDriver());
    const create = { id: "m_create", title: "Brain", createdAt: 1, updatedAt: 1, starred: false, source: { mode: "topic" as const, input: "Brain" }, ...generateMap("topic", "How the human brain learns").graph };
    repo.save(create);
    repo.save(researchMap());
    const metas = repo.list();
    expect(metas.find((m) => m.id === "m_research")?.workspace).toBe("discovery");
    expect(metas.find((m) => m.id === "m_create")?.workspace).toBeUndefined();
    expect(repo.load("m_research")?.research?.notes).toBe("Look for long-term monitoring data.");
    expect(repo.load("m_create")?.workspace).toBeUndefined();
  });

  it("stays compatible with maps saved before Discovery existed", () => {
    // Shape written by the original release: no roles, no link metadata, no workspace.
    const legacy = JSON.stringify({
      version: 1,
      map: {
        id: "old",
        title: "Old map",
        createdAt: 10,
        updatedAt: 20,
        starred: true,
        source: { mode: "text", input: "notes" },
        nodes: [
          { id: "n0", position: { x: 0, y: 0 }, data: { label: "Core", notes: "", category: "concept", kind: "core", seed: 3 } },
          { id: "n1", position: { x: 100, y: 0 }, data: { label: "Child", notes: "n", category: "idea", kind: "planet", seed: 4 } },
        ],
        edges: [{ id: "e0", source: "n0", target: "n1", data: { relation: "causes" } }],
      },
    });
    const map = parseMap(legacy);
    expect(map).not.toBeNull();
    expect(map?.workspace).toBeUndefined();
    expect(map?.research).toBeUndefined();
    expect(map?.nodes[1].data).toEqual({ label: "Child", notes: "n", category: "idea", kind: "planet", seed: 4 });
    expect(map?.edges[0].data).toEqual({ relation: "causes" });
    // Legacy preferences without the Discovery field still load.
    const driver = createMemoryDriver({ "mindspace:v1:prefs": JSON.stringify({ lastMapId: "old", sidebarOpen: true, minimapOpen: false, exportFrame: true, exportBackground: "space" }) });
    expect(new MapRepository(driver).loadPrefs()).toMatchObject({ lastMapId: "old", lastResearchId: null });
  });

  it("repairs corrupt research data instead of failing to open the workspace", () => {
    const map = researchMap();
    const raw = JSON.parse(serializeMap(map));
    raw.map.research = { question: 42, notes: null, search: { provider: "evil", results: "x" } };
    raw.map.nodes.push({ id: "bad", position: { x: 0, y: 0 }, data: { label: "Bad source", notes: "", category: "note", kind: "planet", seed: 1, role: "source", source: { url: "javascript:alert(1)" } } });
    raw.map.edges.push({ id: "weird", source: "q", target: "bad", data: { relation: "teleports", review: "maybe", evidence: { text: 5 } } });
    const restored = parseMap(JSON.stringify(raw));
    expect(restored?.research).toEqual({ question: "", notes: "", analysis: "local" });
    const bad = restored?.nodes.find((n) => n.id === "bad");
    expect(bad?.data.role).toBeUndefined();
    expect(bad?.data.source).toBeUndefined();
    expect(restored?.edges.find((e) => e.id === "weird")?.data).toEqual({ relation: "related" });
    expect(sanitizeLinkData({ relation: "contradicts", review: "hypothesis", rationale: "  why  ", auto: true, evidence: { sourceId: "s1", text: "quote" } })).toEqual({
      relation: "contradicts",
      review: "hypothesis",
      rationale: "why",
      auto: true,
      evidence: { sourceId: "s1", text: "quote" },
    });
  });
});

describe("local content store", () => {
  it("keeps article text per workspace and source, and removes it on request", async () => {
    const store = createMemoryContentStore();
    await store.put({ mapId: "m1", sourceId: "s1", url: "https://a.example", text: "alpha" });
    await store.put({ mapId: "m1", sourceId: "s2", url: "https://b.example", text: "beta" });
    await store.put({ mapId: "m2", sourceId: "s1", url: "https://c.example", text: "gamma" });
    expect((await store.get("m1", "s1"))?.text).toBe("alpha");
    expect(await store.usage("m1")).toEqual({ count: 2, chars: 9 });
    await store.copyMap("m1", "m3");
    expect((await store.get("m3", "s2"))?.text).toBe("beta");
    await store.remove("m1", "s1");
    expect(await store.get("m1", "s1")).toBeNull();
    await store.removeMap("m1");
    expect(await store.usage("m1")).toEqual({ count: 0, chars: 0 });
    expect((await store.get("m2", "s1"))?.text).toBe("gamma");
  });

  it("fingerprints text independent of case and whitespace", async () => {
    expect(await contentHash("Hello   World\n")).toBe(await contentHash("hello world"));
    expect(await contentHash("hello world")).not.toBe(await contentHash("hello there"));
  });
});

describe("research export", () => {
  it("excludes quoted source content and notes unless chosen", () => {
    const map = researchMap();
    const minimal = buildResearchExport(map, map.nodes, map.edges, { includeNotes: false, includePassages: false });
    const text = JSON.stringify(minimal);
    expect(text).not.toContain("Good overview");
    expect(text).not.toContain("monitoring data");
    expect(text).not.toContain("Snippet from search");
    expect(minimal.sources[0]).toMatchObject({ url: "https://coast.example/tide-pools", publishedAt: "2022-06-01", publishedAtSource: "search", status: "ready" });
    expect(minimal.concepts.every((c) => c.sources.every((s) => !("passages" in s)))).toBe(true);
    expect(minimal.links.some((l) => l.kind === "attribution")).toBe(true);

    const full = buildResearchExport(map, map.nodes, map.edges, { includeNotes: true, includePassages: true, articleText: { s1: TEXT } });
    const fullText = JSON.stringify(full);
    expect(fullText).toContain("Good overview");
    expect(fullText).toContain("monitoring data");
    expect(full.concepts.some((c) => c.sources.some((s) => (s.passages?.length ?? 0) > 0))).toBe(true);
    expect(full.sources[0].articleText).toBe(TEXT);
  });

  it("copies a Markdown source list with links", () => {
    const map = researchMap();
    const list = sourceListMarkdown(ops.fromGraph(map).nodes);
    expect(list).toBe("- [Tide pools and their visitors](https://coast.example/tide-pools) — coast.example, 2022-06-01, retrieved 2023-11-14");
  });
});
