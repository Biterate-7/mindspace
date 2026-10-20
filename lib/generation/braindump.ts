import type { Category } from "@/types/graph";
import { GraphBuilder } from "./builder";
import { capitalize, cleanLine, contentWords, isQuestion, jaccard, labelKey, stem, truncate } from "./text";

/**
 * Brain dump: every meaningful line is an idea, kept in the user's own words.
 * Lines are de-duplicated, grouped by shared keywords, and loosely linked across groups.
 */

export const MAX_DUMP_ITEMS = 40;

interface Item {
  text: string;
  stems: Set<string>;
  category: Category;
  duplicates: number;
  cluster: number;
}

const IMPERATIVE = /^(finish|write|start|build|read|launch|learn|cook|call|plant|fix|get|make|create|ship|plan|book|organi[sz]e|clean|buy|sell|apply|practice|practise|try|visit|travel|save|pay|email|text|join|take|go|run|train|track|redesign|design|record|publish|draft|study|prepare|schedule|set up|sort|review|update|finally|stop|quit|exercise|meditate)\b/i;

/** Everyday context words that make weak cluster themes ("work", "home", "week"). */
const GENERIC_STEMS = new Set(
  ["work", "home", "life", "time", "day", "week", "weekly", "month", "morning", "evening", "night", "people", "friends", "family", "stuff", "simple", "thing", "year", "place", "start", "finish", "more"].map(stem),
);
const GOAL_HINT = /\b(i want to|i need to|i should|i'd like to|goal|aim to|this year|by (?:the end of|next|january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|autumn|fall|winter)|someday|one day)\b/i;
const IDEA_HINT = /^(what if|idea[:\s]|maybe|perhaps|imagine|could we|how about)\b|\bidea\b/i;
const NOTE_HINT = /^(note[:\s]|remember|reminder|fyi|ps\b)/i;

export function categorizeThought(line: string): Category {
  if (IDEA_HINT.test(line)) return "idea";
  if (isQuestion(line)) return "question";
  if (NOTE_HINT.test(line)) return "note";
  if (IMPERATIVE.test(line) || GOAL_HINT.test(line)) return "goal";
  return "idea";
}

export interface DumpResult {
  builder: GraphBuilder;
  title: string;
  itemCount: number;
  mergedDuplicates: number;
  truncated: number;
}

export function splitThoughts(input: string): { title: string | null; lines: string[] } {
  const raw = input.replace(/\r\n?/g, "\n").split(/\n|(?<=\S)\s*[•·]\s*(?=\S)/);
  let title: string | null = null;
  const lines: string[] = [];
  raw.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (index === 0 && (/^#/.test(trimmed) || /[:：]$/.test(trimmed))) {
      title = cleanLine(trimmed).replace(/[:：]$/, "");
      return;
    }
    const cleaned = cleanLine(trimmed);
    if (cleaned.length >= 2 && /[\p{L}\p{N}]/u.test(cleaned)) lines.push(cleaned);
  });
  return { title, lines };
}

export function generateFromDump(input: string): DumpResult | null {
  const { title, lines } = splitThoughts(input);
  if (lines.length === 0) return null;

  // --- Normalise duplicates and near-duplicates ---------------------------
  const items: Item[] = [];
  let merged = 0;
  for (const line of lines) {
    const stems = new Set(contentWords(line).map(stem));
    const key = labelKey(line);
    const duplicate = items.find((item) => labelKey(item.text) === key || (stems.size >= 2 && jaccard(stems, item.stems) >= 0.8));
    if (duplicate) {
      duplicate.duplicates++;
      merged++;
      continue;
    }
    items.push({ text: truncate(capitalize(line), 120), stems, category: categorizeThought(line), duplicates: 0, cluster: -1 });
  }
  const truncated = Math.max(0, items.length - MAX_DUMP_ITEMS);
  items.splice(MAX_DUMP_ITEMS);

  // --- Theme words shared by several thoughts ----------------------------
  const df = new Map<string, number>();
  const surface = new Map<string, Map<string, number>>();
  for (const item of items) {
    for (const s of item.stems) df.set(s, (df.get(s) ?? 0) + 1);
    for (const word of contentWords(item.text)) {
      const s = stem(word);
      const forms = surface.get(s) ?? new Map<string, number>();
      forms.set(word, (forms.get(word) ?? 0) + 1);
      surface.set(s, forms);
    }
  }
  const maxShare = Math.max(2, Math.ceil(items.length * 0.6));
  const themes = [...df.entries()]
    .filter(([s, count]) => count >= 2 && count <= maxShare && s.length >= 3 && !GENERIC_STEMS.has(s))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const themeLabel = (s: string): string => {
    const forms = [...(surface.get(s)?.entries() ?? [])].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
    return capitalize(forms[0]?.[0] ?? s);
  };

  interface Cluster {
    label: string;
    stem: string | null;
    members: Item[];
    hub: Item | null;
  }
  const clusters: Cluster[] = [];
  for (const [themeStem] of themes) {
    if (clusters.length >= 7) break;
    const members = items.filter((item) => item.cluster < 0 && item.stems.has(themeStem));
    if (members.length < 2) continue;
    const cluster: Cluster = { label: themeLabel(themeStem), stem: themeStem, members, hub: null };
    // If a thought *is* the theme ("Writing"), promote it to be the hub instead of inventing one.
    cluster.hub = members.find((m) => labelKey(m.text) === labelKey(cluster.label)) ?? null;
    members.forEach((m) => (m.cluster = clusters.length));
    clusters.push(cluster);
  }
  // Second pass: loose thoughts join the cluster they share the most words with.
  for (const item of items) {
    if (item.cluster >= 0) continue;
    let best = -1;
    let bestShared = 0;
    clusters.forEach((cluster, index) => {
      let shared = 0;
      for (const member of cluster.members) {
        for (const s of item.stems) if (member.stems.has(s) && (df.get(s) ?? 0) >= 2) shared += GENERIC_STEMS.has(s) ? 0.4 : 1;
      }
      if (shared > bestShared) {
        bestShared = shared;
        best = index;
      }
    });
    if (best >= 0) {
      item.cluster = best;
      clusters[best].members.push(item);
    }
  }
  // Remaining thoughts group by kind when there are enough of them.
  const categoryHubs: Partial<Record<Category, string>> = { goal: "Goals and plans", question: "Open questions", idea: "Loose ideas", note: "Notes" };
  for (const category of ["goal", "question", "idea", "note"] as Category[]) {
    const loose = items.filter((item) => item.cluster < 0 && item.category === category);
    if (loose.length < 3) continue;
    loose.forEach((m) => (m.cluster = clusters.length));
    clusters.push({ label: categoryHubs[category] ?? capitalize(category), stem: null, members: loose, hub: null });
  }

  // --- Build ----------------------------------------------------------------
  const builder = new GraphBuilder(MAX_DUMP_ITEMS + 9);
  const themeNames = clusters.filter((c) => c.stem).map((c) => c.label.toLowerCase());
  const coreLabel = title ? truncate(capitalize(title), 80) : "My thoughts";
  const coreId = builder.addNode({
    label: coreLabel,
    notes: `${items.length} thought${items.length === 1 ? "" : "s"} captured${merged ? `, ${merged} duplicate${merged === 1 ? "" : "s"} merged` : ""}${truncated ? `, ${truncated} more not shown` : ""}. Groupings come from shared words — rearrange them freely.`,
    category: "concept",
    kind: "core",
  });
  if (!coreId) return null;

  const itemIds = new Map<Item, string>();
  const noteFor = (item: Item) => (item.duplicates ? `Mentioned ${item.duplicates + 1} times.` : "");

  clusters.forEach((cluster) => {
    const majority = mostCommon(cluster.members.map((m) => m.category));
    let hubId: string | null;
    if (cluster.hub) {
      hubId = builder.addNode({ label: cluster.hub.text, notes: noteFor(cluster.hub), category: cluster.hub.category, kind: "planet" });
      itemIds.set(cluster.hub, hubId ?? "");
    } else {
      hubId = builder.addNode({
        label: cluster.label,
        notes: cluster.stem ? `Thoughts that mention “${cluster.label.toLowerCase()}”.` : `Thoughts grouped by kind.`,
        category: cluster.stem ? majority : (cluster.members[0]?.category ?? "idea"),
        kind: "planet",
      });
    }
    builder.addEdge(coreId, hubId, "related");
    for (const member of cluster.members) {
      if (member === cluster.hub) continue;
      const id = builder.addNode({ label: member.text, notes: noteFor(member), category: member.category, kind: member.category === "question" || member.category === "note" ? "moon" : "star" });
      if (!id) continue;
      itemIds.set(member, id);
      builder.addEdge(hubId, id, "related");
    }
  });
  for (const item of items) {
    if (item.cluster >= 0) continue;
    const id = builder.addNode({ label: item.text, notes: noteFor(item), category: item.category, kind: item.category === "question" || item.category === "note" ? "moon" : "star" });
    if (!id) continue;
    itemIds.set(item, id);
    builder.addEdge(coreId, id, "related");
  }

  // --- Cross links: thoughts that share a meaningful word ----------------
  const linkLimit = Math.max(2, Math.round(items.length * 0.35));
  let added = 0;
  for (let i = 0; i < items.length && added < linkLimit; i++) {
    for (let j = i + 1; j < items.length && added < linkLimit; j++) {
      const a = items[i];
      const b = items[j];
      const shared = [...a.stems].filter((s) => b.stems.has(s) && (df.get(s) ?? 0) >= 2 && s !== clusters[a.cluster]?.stem);
      if (shared.length === 0) continue;
      const idA = itemIds.get(a);
      const idB = itemIds.get(b);
      if (!idA || !idB) continue;
      let source = idA;
      let target = idB;
      let relation: "related" | "supports" = "related";
      if (a.category === "goal" && b.category !== "goal" && b.category !== "question") {
        source = idB;
        target = idA;
        relation = "supports";
      } else if (b.category === "goal" && a.category !== "goal" && a.category !== "question") {
        relation = "supports";
      }
      if (builder.addEdge(source, target, relation)) added++;
    }
  }

  const title2 = title ?? (themeNames.length ? `Thoughts on ${listPhrase(themeNames.slice(0, 3))}` : "Brain dump");
  return { builder, title: truncate(capitalize(title2), 80), itemCount: items.length, mergedDuplicates: merged, truncated };
}

function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>();
  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function listPhrase(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
