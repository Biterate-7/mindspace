import type { StateCreator } from "zustand";
import type { IdeaNode, MindMap } from "@/types/graph";
import type { IngestErrorCode, SearchResult, SearchRun, SourceError, SourceInfo } from "@/types/research";
import { analyzeLocally } from "@/lib/discovery/analyze/local";
import { ApiError, fetchConfig, ingestSource, searchSources } from "@/lib/discovery/client";
import { contentHash, contentStore } from "@/lib/discovery/contentStore";
import { placeNewNodes } from "@/lib/discovery/layout";
import { mergeSourceAnalysis, removeSource } from "@/lib/discovery/merge";
import { domainOf, parseHttpUrl, splitUrlInput, urlKey } from "@/lib/discovery/url";
import * as ops from "@/lib/graph/ops";
import { truncate } from "@/lib/generation/text";
import { createId, hashString } from "@/lib/utils/random";
import { derive } from "./graphSlice";
import type { Job, JobStage, ResearchSlice, Store } from "./types";

/**
 * Discovery: search, import queue and source processing.
 *
 * Imports run in this tab with real stage reporting. Their progress lives in `jobs`
 * (memory only); the graph records only settled facts — a pending, ready or failed
 * source — so a refresh never leaves a fake "in progress" state behind.
 */

export const MAX_SOURCES = 40;
const MAX_CONCURRENT = 3;
const MAX_MANUAL_CHARS = 100_000;

interface QueueItem {
  mapId: string;
  sourceId: string;
  refetch: boolean;
}

const controllers = new Map<string, AbortController>();
let queue: QueueItem[] = [];
let running = 0;
let searchController: AbortController | null = null;
let configController: AbortController | null = null;
let batch = { sources: 0, concepts: 0, failed: 0 };

function sourceNodes(nodes: readonly IdeaNode[]): IdeaNode[] {
  return nodes.filter((n) => n.data.role === "source" && n.data.source);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newSourceNode(nodes: readonly IdeaNode[], info: SourceInfo): IdeaNode {
  const id = createId("s", new Set(nodes.map((n) => n.id)));
  return {
    id,
    type: "idea",
    position: { x: 0, y: 0 },
    data: { label: truncate(info.title, 140), notes: "", category: "note", kind: "planet", seed: hashString(`${id}:${info.key}`), role: "source", source: info },
  };
}

/** A readable placeholder title until the page itself has been read. */
function placeholderTitle(url: URL): string {
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, "").split("/").filter(Boolean).pop() ?? "";
  const words = path.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_]+/g, " ").trim();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : domainOf(url);
}

function errorFrom(error: unknown): SourceError {
  if (error instanceof ApiError) return { code: error.code === "bad_request" || error.code === "not_configured" ? "network" : error.code, message: error.message };
  return { code: "network", message: "The import failed unexpectedly. Try again." };
}

export const createResearchSlice: StateCreator<Store, [], [], ResearchSlice> = (set, get) => {
  const setJob = (sourceId: string, stage: JobStage | null) => {
    const jobs = { ...get().jobs };
    if (stage === null) delete jobs[sourceId];
    else jobs[sourceId] = { stage, startedAt: get().jobs[sourceId]?.startedAt ?? Date.now() } satisfies Job;
    set({ jobs });
  };

  const isCurrent = (mapId: string) => get().current?.id === mapId;

  const sourceNode = (sourceId: string) => get().nodes.find((n) => n.id === sourceId && n.data.role === "source");

  /** Waits for drags and layout animations so undo snapshots stay consistent. */
  const whenIdle = async () => {
    for (let i = 0; i < 300 && get().isBusy(); i++) await sleep(100);
  };

  const patchSource = (sourceId: string, patch: Partial<SourceInfo>, label?: string) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === sourceId);
    if (!node?.data.source) return;
    const source = { ...node.data.source, ...patch };
    for (const key of Object.keys(source) as Array<keyof SourceInfo>) if (source[key] === undefined) delete source[key];
    state.commitGraph({ nodes: ops.updateNodeData(state.nodes, sourceId, { source, ...(label ? { label: truncate(label, 140) } : {}) }) });
  };

  const fail = (sourceId: string, error: SourceError) => {
    batch.failed++;
    patchSource(sourceId, { status: "failed", error });
  };

  const pump = () => {
    while (running < MAX_CONCURRENT && queue.length > 0) {
      const item = queue.shift() as QueueItem;
      if (!isCurrent(item.mapId) || !sourceNode(item.sourceId)) {
        setJob(item.sourceId, null);
        continue;
      }
      running++;
      void runJob(item).finally(() => {
        running--;
        controllers.delete(item.sourceId);
        setJob(item.sourceId, null);
        pump();
        if (running === 0 && queue.length === 0) reportBatch();
      });
    }
  };

  const reportBatch = () => {
    const { sources, concepts, failed } = batch;
    batch = { sources: 0, concepts: 0, failed: 0 };
    if (sources === 0 && failed === 0) return;
    // Bring the newly placed concepts into view.
    if (sources > 0) get().requestCamera({ type: "fit", duration: 800 });
    const parts = [];
    if (sources) parts.push(`Imported ${sources} source${sources === 1 ? "" : "s"} · ${concepts} concept${concepts === 1 ? "" : "s"} placed`);
    if (failed) parts.push(`${failed} failed — see Sources`);
    get().toast(parts.join(". "), { tone: failed && !sources ? "error" : "success", duration: 5200 });
  };

  const enqueue = (sourceIds: string[], refetch = false) => {
    const mapId = get().current?.id;
    if (!mapId) return;
    for (const sourceId of sourceIds) {
      if (controllers.has(sourceId) || queue.some((q) => q.sourceId === sourceId)) continue;
      queue.push({ mapId, sourceId, refetch });
      setJob(sourceId, "queued");
    }
    pump();
  };

  const runJob = async ({ mapId, sourceId, refetch }: QueueItem) => {
    const controller = new AbortController();
    controllers.set(sourceId, controller);
    const store = contentStore();
    const node = sourceNode(sourceId);
    const source = node?.data.source;
    if (!source) return;
    try {
      let text: string | null = null;
      let patch: Partial<SourceInfo> = {};
      const stored = refetch ? null : await store.get(mapId, sourceId).catch(() => null);
      if (stored && (source.status === "ready" || source.textOrigin === "pasted" || source.origin === "manual")) {
        // Re-analysis reuses the locally stored text instead of fetching the page again.
        setJob(sourceId, "reading");
        text = stored.text;
      } else if (source.origin === "manual") {
        throw new ApiError("no_content", "The pasted text for this source is no longer stored. Paste it again.");
      } else {
        setJob(sourceId, "checking");
        const article = await ingestSource(source.url, (stage) => setJob(sourceId, stage), controller.signal);
        text = article.text;
        const canonical = article.canonicalUrl ?? article.finalUrl;
        patch = {
          title: article.title || source.title,
          canonicalUrl: article.canonicalUrl,
          domain: article.domain || source.domain,
          siteName: article.siteName,
          byline: article.byline,
          description: article.description,
          // A page's own publication date wins over one reported by search; never invent one.
          publishedAt: article.publishedAt ?? (source.publishedFrom === "search" ? source.publishedAt : undefined),
          publishedFrom: article.publishedAt ? "page" : source.publishedFrom === "search" && source.publishedAt ? "search" : undefined,
          retrievedAt: article.retrievedAt,
          wordCount: article.wordCount,
          truncated: article.truncated || undefined,
          paywallHint: article.paywallHint || undefined,
          textOrigin: "fetched",
          key: source.key || urlKey(canonical),
        };
        // Duplicate check by canonical address before storing anything.
        const canonicalKey = urlKey(canonical);
        const twin = sourceNodes(get().nodes).find((n) => n.id !== sourceId && (n.data.source?.key === canonicalKey || (n.data.source?.canonicalUrl && urlKey(n.data.source.canonicalUrl) === canonicalKey)));
        if (twin) throw new ApiError("duplicate", `This is the same page as “${twin.data.label}”, which is already imported.`);
        try {
          await store.put({ mapId, sourceId, url: article.finalUrl, text });
        } catch {
          // Storage can fail (quota, private mode). Analysis still works; re-analysis will refetch.
        }
      }
      if (controller.signal.aborted || !isCurrent(mapId)) return;

      const hash = await contentHash(text);
      const twin = sourceNodes(get().nodes).find((n) => n.id !== sourceId && n.data.source?.contentHash === hash);
      if (twin) {
        await store.remove(mapId, sourceId).catch(() => undefined);
        throw new ApiError("duplicate", `This text is identical to “${twin.data.label}”, which is already imported.`);
      }

      setJob(sourceId, "analyzing");
      // Yield so the stage change paints before the (synchronous) analysis runs.
      await sleep(16);
      const question = get().current?.research?.question ?? "";
      const title = patch.title ?? source.title;
      const analysis = analyzeLocally({ text, title, question });
      if (analysis.concepts.length === 0 && !analysis.summary) {
        throw new ApiError("analysis_failed", "No usable sentences were found in this text, so no concepts could be extracted.");
      }

      await whenIdle();
      if (controller.signal.aborted || !isCurrent(mapId) || !sourceNode(sourceId)) return;
      const state = get();
      const merged = mergeSourceAnalysis(state, sourceId, analysis, { ...patch, contentHash: hash }, question);
      state.commitGraph({ nodes: merged.nodes, edges: merged.edges });
      batch.sources++;
      batch.concepts += merged.stats.created;
    } catch (error) {
      if (controller.signal.aborted) return;
      if (!isCurrent(mapId) || !sourceNode(sourceId)) return;
      await whenIdle();
      fail(sourceId, errorFrom(error));
    }
  };

  const addSourceNodes = (infos: SourceInfo[]): string[] => {
    const state = get();
    const existing = sourceNodes(state.nodes).length;
    const room = MAX_SOURCES - existing;
    if (room <= 0) {
      state.toast(`A workspace holds up to ${MAX_SOURCES} sources. Remove some before adding more.`, { tone: "error" });
      return [];
    }
    const accepted = infos.slice(0, room);
    if (accepted.length < infos.length) state.toast(`Only ${room} more source${room === 1 ? "" : "s"} fit in this workspace (limit ${MAX_SOURCES}).`, { tone: "error" });
    let nodes = state.nodes;
    const ids: string[] = [];
    for (const info of accepted) {
      const node = newSourceNode(nodes, info);
      nodes = [...nodes, node];
      ids.push(node.id);
    }
    const placed = placeNewNodes(nodes, state.edges, new Set(ids));
    nodes = nodes.map((n) => (placed[n.id] ? { ...n, position: placed[n.id] } : n));
    state.commitGraph({ nodes });
    return ids;
  };

  const existingKeys = () => new Set(sourceNodes(get().nodes).flatMap((n) => [n.data.source?.key, n.data.source?.canonicalUrl ? urlKey(n.data.source.canonicalUrl) : undefined]).filter((k): k is string => Boolean(k)));

  return {
    mode: "create",
    discoverOpen: false,
    discoveryConfig: { status: "idle", value: null },
    searchState: { status: "idle", more: false },
    jobs: {},
    researchFilter: "all",
    researchPanelOpen: true,
    researchTab: "search",
    selectedResults: [],

    openDiscover: () => {
      get().loadDiscoveryConfig();
      if (get().view === "workspace") set({ discoverOpen: true, createOpen: false, mode: "discovery" });
      else set({ view: "discover", mode: "discovery", createOpen: false });
    },

    closeDiscover: () => {
      const current = get().current;
      if (current) set({ discoverOpen: false, view: "workspace", mode: current.workspace === "discovery" ? "discovery" : "create" });
    },

    switchMode: (mode) => {
      const state = get();
      if (mode === "create") {
        if (state.current && state.current.workspace !== "discovery" && !state.createOpen && !state.discoverOpen) return;
        const target = state.maps.find((m) => m.workspace !== "discovery" && m.id === state.prefs.lastMapId) ?? state.maps.find((m) => m.workspace !== "discovery");
        if (target) {
          state.openMap(target.id);
          set({ discoverOpen: false, createOpen: false });
        } else state.openCreate();
        return;
      }
      if (state.current?.workspace === "discovery" && !state.createOpen && !state.discoverOpen) return;
      const target = state.maps.find((m) => m.workspace === "discovery" && m.id === state.prefs.lastResearchId) ?? state.maps.find((m) => m.workspace === "discovery");
      if (target) {
        state.openMap(target.id);
        set({ discoverOpen: false, createOpen: false });
      } else state.openDiscover();
    },

    loadDiscoveryConfig: (force = false) => {
      const status = get().discoveryConfig.status;
      if (!force && (status === "loading" || status === "ready")) return;
      configController?.abort();
      const controller = new AbortController();
      configController = controller;
      set({ discoveryConfig: { ...get().discoveryConfig, status: "loading" } });
      fetchConfig(controller.signal)
        .then((value) => set({ discoveryConfig: { status: "ready", value } }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          set({ discoveryConfig: { status: "error", value: null, error: error instanceof Error ? error.message : "Could not load settings." } });
        });
    },

    startResearch: (question, urlText = "") => {
      const state = get();
      const clean = question.replace(/\s+/g, " ").trim().slice(0, 500);
      if (!clean) {
        state.toast("Write the question you want to understand first.", { tone: "error" });
        return false;
      }
      const now = Date.now();
      const coreId = "q_root";
      const map: MindMap = {
        id: createId("m"),
        title: truncate(clean.replace(/[?!.]+$/, ""), 100),
        createdAt: now,
        updatedAt: now,
        starred: false,
        source: { mode: "topic", input: clean },
        workspace: "discovery",
        research: { question: clean, notes: "", analysis: "local" },
        nodes: [{ id: coreId, position: { x: 0, y: 0 }, data: { label: truncate(clean, 140), notes: "", category: "question", kind: "core", seed: hashString(clean) } }],
        edges: [],
      };
      if (!state.openNewMap(map)) return false;
      set({ researchPanelOpen: true, researchTab: "search" });
      const urls = urlText.trim();
      if (urls) {
        const result = get().addSourceUrls(urls);
        if (result.added > 0) set({ researchTab: "sources" });
      }
      const config = get().discoveryConfig.value;
      if (config?.web || config?.encyclopedia || get().discoveryConfig.status !== "ready") void get().runSearch(clean);
      return true;
    },

    runSearch: async (query, options = {}) => {
      const state = get();
      const research = state.current?.research;
      if (!state.current || !research) return;
      const previous = research.search;
      const more = Boolean(options.more && previous);
      const config = state.discoveryConfig.value;
      const scope = options.scope ?? previous?.scope ?? (config && !config.web && config.encyclopedia ? "encyclopedia" : "web");
      const text = (query ?? (more ? previous?.query : research.question) ?? "").replace(/\s+/g, " ").trim();
      if (!text) return;
      if (more && previous?.nextOffset == null) return;
      searchController?.abort();
      const controller = new AbortController();
      searchController = controller;
      const mapId = state.current.id;
      set({ searchState: { status: "searching", more } });
      try {
        const offset = more ? (previous?.nextOffset ?? 0) : 0;
        const exclude = more ? (previous?.results.map((r) => r.key) ?? []) : [];
        const response = await searchSources(text, scope, offset, exclude, controller.signal);
        if (controller.signal.aborted || !isCurrent(mapId)) return;
        const search: SearchRun = more && previous
          ? { ...previous, results: [...previous.results, ...response.results].slice(0, 120), nextOffset: response.nextOffset, fetchedAt: Date.now() }
          : { query: text, scope: response.scope, provider: response.provider.id as SearchRun["provider"], results: response.results, fetchedAt: Date.now(), nextOffset: response.nextOffset };
        get().setResearch({ search });
        set({ searchState: { status: "idle", more: false }, selectedResults: more ? get().selectedResults : [] });
      } catch (error) {
        if (controller.signal.aborted) return;
        const apiError = error instanceof ApiError ? error : null;
        set({ searchState: { status: "error", more, error: apiError?.message ?? "Search failed.", code: apiError?.code } });
      }
    },

    toggleResult: (id) => {
      const selected = get().selectedResults;
      set({ selectedResults: selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id] });
    },

    setSelectedResults: (ids) => set({ selectedResults: ids }),

    importResults: (ids) => {
      const state = get();
      const search = state.current?.research?.search;
      if (!search) return;
      const keys = existingKeys();
      const chosen = ids
        .map((id) => search.results.find((r) => r.id === id))
        .filter((r): r is SearchResult => r !== undefined && !keys.has(r.key) && !r.unsupported);
      if (chosen.length === 0) {
        state.toast("Those results are already imported.");
        return;
      }
      const infos: SourceInfo[] = chosen.map((r) => ({
        url: r.url,
        key: r.key,
        domain: r.domain,
        title: r.title,
        snippet: r.snippet || undefined,
        publishedAt: r.publishedAt,
        publishedFrom: r.publishedAt ? "search" : undefined,
        status: "pending",
        origin: "search",
        query: search.query,
      }));
      const added = addSourceNodes(infos);
      set({ selectedResults: [] });
      enqueue(added);
    },

    addSourceUrls: (text) => {
      const { valid, invalid } = splitUrlInput(text);
      const keys = existingKeys();
      let duplicates = 0;
      const infos: SourceInfo[] = [];
      for (const url of valid) {
        const key = urlKey(url);
        if (keys.has(key)) {
          duplicates++;
          continue;
        }
        keys.add(key);
        infos.push({ url: url.href, key, domain: domainOf(url), title: placeholderTitle(url), status: "pending", origin: "url" });
      }
      const added = infos.length ? addSourceNodes(infos) : [];
      enqueue(added);
      return { added: added.length, invalid, duplicates };
    },

    addManualSource: ({ title, url, text }) => {
      const state = get();
      const mapId = state.current?.id;
      const body = text.trim();
      if (!mapId || body.length < 80) {
        state.toast("Paste at least a paragraph of text to analyse.", { tone: "error" });
        return false;
      }
      const parsed = url?.trim() ? parseHttpUrl(url) : null;
      if (url?.trim() && !parsed) {
        state.toast("That source address is not a valid http(s) URL.", { tone: "error" });
        return false;
      }
      const info: SourceInfo = {
        url: parsed?.href ?? "",
        key: parsed ? urlKey(parsed) : `manual:${hashString(body.slice(0, 4000)).toString(36)}`,
        domain: parsed ? domainOf(parsed) : "",
        title: title.trim().slice(0, 300) || (parsed ? placeholderTitle(parsed) : "Pasted text"),
        status: "pending",
        origin: "manual",
        textOrigin: "pasted",
        wordCount: body.split(/\s+/).length,
      };
      const [id] = addSourceNodes([info]);
      if (!id) return false;
      void contentStore()
        .put({ mapId, sourceId: id, url: info.url, text: body.slice(0, MAX_MANUAL_CHARS) })
        .catch(() => undefined)
        .finally(() => enqueue([id]));
      return true;
    },

    setManualText: async (sourceId, text) => {
      const state = get();
      const mapId = state.current?.id;
      const node = sourceNode(sourceId);
      const body = text.trim();
      if (!mapId || !node?.data.source) return;
      if (body.length < 80) {
        state.toast("Paste at least a paragraph of text to analyse.", { tone: "error" });
        return;
      }
      try {
        await contentStore().put({ mapId, sourceId, url: node.data.source.url, text: body.slice(0, MAX_MANUAL_CHARS) });
      } catch {
        state.toast("The text could not be stored in this browser, so it cannot be analysed.", { tone: "error" });
        return;
      }
      patchSource(sourceId, { textOrigin: "pasted", status: "pending", error: undefined, wordCount: body.split(/\s+/).length, retrievedAt: Date.now() });
      enqueue([sourceId]);
    },

    processSource: (sourceId, options = {}) => {
      if (!sourceNode(sourceId)) return;
      enqueue([sourceId], Boolean(options.refetch));
    },

    processPending: () => {
      const ids = sourceNodes(get().nodes)
        .filter((n) => n.data.source?.status === "pending")
        .map((n) => n.id);
      enqueue(ids);
    },

    cancelSource: (sourceId) => {
      queue = queue.filter((q) => q.sourceId !== sourceId);
      controllers.get(sourceId)?.abort();
      setJob(sourceId, null);
    },

    cancelAllJobs: () => {
      queue = [];
      for (const controller of controllers.values()) controller.abort();
      searchController?.abort();
      batch = { sources: 0, concepts: 0, failed: 0 };
      set({ jobs: {}, searchState: { status: "idle", more: false } });
    },

    removeSourceNow: (sourceId) => {
      const state = get();
      const mapId = state.current?.id;
      const node = sourceNode(sourceId);
      if (!mapId || !node) return;
      get().cancelSource(sourceId);
      const result = removeSource(state, sourceId);
      state.commitGraph({ nodes: result.nodes, edges: result.edges });
      void contentStore().remove(mapId, sourceId).catch(() => undefined);
      const kept = result.keptConceptIds.length;
      state.toast(`Removed “${truncate(node.data.label, 48)}” and ${result.removedConceptIds.length} concept${result.removedConceptIds.length === 1 ? "" : "s"} only it supported${kept ? `; kept ${kept} with your notes or links` : ""}.`, {
        action: { label: "Undo", run: () => get().undo() },
        duration: 6500,
      });
    },

    removeSourceContent: async (sourceId) => {
      const mapId = get().current?.id;
      if (!mapId) return;
      await contentStore().remove(mapId, sourceId).catch(() => undefined);
      get().toast("Stored article text removed from this browser. Concepts, passages and links stay.");
    },

    setResearchNotes: (notes) => get().setResearch({ notes: notes.slice(0, 20000) }),

    setResearchFilter: (filter) => {
      const state = get();
      set({ researchFilter: filter, ...derive({ ...state, researchFilter: filter }) });
    },

    toggleResearchPanel: (open) => set({ researchPanelOpen: open ?? !get().researchPanelOpen }),

    setResearchTab: (tab) => set({ researchTab: tab, researchPanelOpen: true }),

    setEdgeReview: (edgeId, review) => {
      const state = get();
      state.commitGraph({ edges: ops.updateEdgeData(state.edges, edgeId, { review }) });
    },

    updateEdgeData: (edgeId, patch) => {
      const state = get();
      state.commitGraph({ edges: ops.updateEdgeData(state.edges, edgeId, patch) }, `edge:${edgeId}:${Object.keys(patch).sort().join(",")}`);
    },

    updateConcept: (nodeId, patch) => {
      const state = get();
      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node?.data.concept) return;
      const concept = { ...node.data.concept, ...patch };
      state.commitGraph({ nodes: ops.updateNodeData(state.nodes, nodeId, { concept }) }, `concept:${nodeId}:${Object.keys(patch).sort().join(",")}`);
    },

    connectResearch: (source, target, relation, extra = {}) => {
      const state = get();
      const result = ops.connect(state, source, target, relation, { review: "accepted", ...extra });
      if (!result.ok) {
        if (result.reason === "duplicate") state.toast("Those two are already connected — select the link to change it.");
        return false;
      }
      state.commitGraph({ edges: result.edges });
      set({ linkSourceId: null });
      return true;
    },
  };
};

/** Error codes worth offering a manual-paste fallback for. */
export const PASTE_FALLBACK: ReadonlySet<IngestErrorCode> = new Set(["forbidden", "paywalled", "no_content", "robots_disallowed", "unsupported_type", "timeout", "network", "http_error", "rate_limited", "dns_failed"]);

