import type { Category } from "@/types/graph";
import { clamp } from "@/lib/utils/random";
import { GraphBuilder, kindForDepth, pairKey } from "./builder";
import { categorizePhrase, inferRelationFromCategories, inferRelationFromSentence } from "./relations";
import { capitalize, isStopword, labelKey, normalizeWhitespace, splitSentences, stem, stemSet, truncate } from "./text";

/**
 * Concept extraction for pasted prose. A RAKE-style phrase finder scores recurring,
 * well-positioned phrases; sentence co-occurrence groups them into clusters and the
 * shared sentences supply relationship cues and notes. Wording comes from the source text.
 */

/** Words that are rarely meaningful as stand-alone concepts in essays. */
const WEAK_WORDS = new Set(
  `important different various several certain specific main major key common general particular whole real true best better worse example examples number part parts form forms level levels large high low often become becomes include includes including provide provides allow allows create creates show shows mean means help helps change changes area areas case cases way fact point points problem result results place group groups type types amount role idea world people person thing everything someone need needs today first second third last next another others able likely possible important significant simple simply rather instead approach issue issues aspect aspects factor factors`.split(
    /\s+/,
  ),
);

interface Token {
  text: string;
  stem: string;
  start: number;
  end: number;
  stop: boolean;
  capital: boolean;
}

interface Sentence {
  index: number;
  text: string;
  paragraph: number;
  tokens: Token[];
}

interface Candidate {
  key: string;
  size: number;
  forms: Map<string, number>;
  sentences: Set<number>;
  firstSentence: number;
  occurrences: number;
  capitalized: number;
  exampleCue: boolean;
  score: number;
}

export interface TextResult {
  builder: GraphBuilder;
  title: string;
  conceptCount: number;
}

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const EXAMPLE_LEAD = /(such as|for example|for instance|e\.g\.|including)\s*$/i;

function tokenizeSentence(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(WORD)) {
    const raw = match[0];
    const lower = raw.toLowerCase().replace(/['’]s$/, "");
    tokens.push({
      text: raw,
      stem: stem(lower),
      start: match.index ?? 0,
      end: (match.index ?? 0) + raw.length,
      stop: isStopword(lower),
      capital: /^\p{Lu}/u.test(raw),
    });
  }
  return tokens;
}

function hasBreak(text: string, from: number, to: number): boolean {
  return /[,.;:!?()[\]{}"“”/|—–]/.test(text.slice(from, to));
}

function detectTitle(lines: string[]): { title: string | null; body: string } {
  const first = lines[0]?.trim() ?? "";
  const words = first.split(/\s+/).filter(Boolean).length;
  const rest = lines.slice(1).join("\n").trim();
  const looksLikeTitle = /^#/.test(first) || (words > 0 && words <= 12 && !/[.!,;]$/.test(first) && rest.length > 40);
  if (looksLikeTitle) return { title: normalizeWhitespace(first.replace(/^#+\s*/, "").replace(/[:：]$/, "")), body: rest };
  return { title: null, body: lines.join("\n") };
}

function collectCandidates(sentences: Sentence[], titleStems: Set<string>): Map<string, Candidate> {
  const candidates = new Map<string, Candidate>();
  const total = Math.max(1, sentences.length);

  const record = (sentence: Sentence, from: number, to: number) => {
    const tokens = sentence.tokens.slice(from, to + 1);
    const key = tokens.map((t) => t.stem).join(" ");
    const form = sentence.text.slice(tokens[0].start, tokens[tokens.length - 1].end);
    let candidate = candidates.get(key);
    if (!candidate) {
      candidate = {
        key,
        size: tokens.filter((t) => !t.stop).length,
        forms: new Map(),
        sentences: new Set(),
        firstSentence: sentence.index,
        occurrences: 0,
        capitalized: 0,
        exampleCue: false,
        score: 0,
      };
      candidates.set(key, candidate);
    }
    candidate.forms.set(form, (candidate.forms.get(form) ?? 0) + 1);
    candidate.sentences.add(sentence.index);
    candidate.occurrences++;
    const atSentenceStart = from === 0;
    if (tokens.every((t) => t.capital) && !atSentenceStart) candidate.capitalized++;
    if (EXAMPLE_LEAD.test(sentence.text.slice(0, tokens[0].start))) candidate.exampleCue = true;
  };

  for (const sentence of sentences) {
    const { tokens, text } = sentence;
    let runStart = -1;
    const flush = (end: number) => {
      if (runStart < 0) return;
      for (let i = runStart; i <= end; i++) {
        for (let j = i; j <= Math.min(end, i + 2); j++) {
          const first = tokens[i];
          const last = tokens[j];
          if (j === i && (WEAK_WORDS.has(first.text.toLowerCase()) || first.text.length < 3)) continue;
          if (j > i && (WEAK_WORDS.has(first.text.toLowerCase()) || WEAK_WORDS.has(last.text.toLowerCase()))) continue;
          record(sentence, i, j);
        }
      }
      runStart = -1;
    };
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const broken = i > 0 && hasBreak(text, tokens[i - 1].end, token.start);
      if (broken) flush(i - 1);
      if (token.stop) {
        // Allow "rule of law" style phrases: content + of + content.
        const prev = tokens[i - 1];
        const next = tokens[i + 1];
        if (token.text.toLowerCase() === "of" && prev && next && !prev.stop && !next.stop && !hasBreak(text, prev.end, next.end)) {
          if (!WEAK_WORDS.has(prev.text.toLowerCase()) && !WEAK_WORDS.has(next.text.toLowerCase())) record(sentence, i - 1, i + 1);
        }
        flush(i - 1);
        continue;
      }
      if (runStart < 0) runStart = i;
    }
    flush(tokens.length - 1);
  }

  for (const candidate of candidates.values()) {
    const tf = candidate.sentences.size;
    const multi = candidate.size > 1;
    const stems = candidate.key.split(" ");
    let score = tf;
    if (multi) score *= 1 + 0.55 * (candidate.size - 1);
    const properNoun = candidate.capitalized >= Math.max(1, candidate.occurrences * 0.6);
    if (multi && tf === 1 && !properNoun) score *= candidate.size === 2 ? 0.75 : 0.5;
    if (candidate.key.includes(" of ") && tf < 2) score *= 0.2;
    // One-off phrases containing a likely verb or adverb are usually clause fragments ("platforms compete").
    if (tf === 1 && !properNoun && looksVerbal(candidate)) score *= multi ? 0.15 : 0.4;
    if (properNoun) score += 0.6;
    if (candidate.firstSentence / total < 0.2) score *= 1.15;
    if (stems.some((s) => titleStems.has(s))) score *= 1.5;
    candidate.score = score;
  }
  return candidates;
}

/** Common words that are nearly always verbs, used to reject clause fragments. */
const VERBS = new Set(
  `argue argues argued compete competes competed enable enables enabled regain regains protect protects protected become becomes became include includes provide provides allow allows seem seems tend tends explain explains describe describes develop develops involve involves require requires ensure ensures improve improves generate generates encourage encourages prevent prevents achieve achieves avoid avoids determine determines depend depends rely relies appear appears remain remains suggest suggests believe believes consider considers create creates produce produces affect affects reveal reveals receive receives represent represents reflect reflects replace replaces rank ranks reward rewards drives linked link links breaking break breaks grow grows growing grew lead leads led cause causes caused help helps helped makes made gives gave takes took shows showed find finds found keep keeps kept leave leaves left bring brings brought begin begins began happen happens happened offer offers offered expect expects expected reach reaches reached claim claims claimed`.split(
    /\s+/,
  ),
);

function looksVerbal(candidate: Candidate): boolean {
  const form = [...candidate.forms.keys()][0]?.toLowerCase() ?? "";
  const words = form.split(/\s+/);
  const first = words[0] ?? "";
  const last = words[words.length - 1] ?? "";
  return words.some((w) => VERBS.has(w) || isAdverb(w)) || (words.length > 1 && /(ed|ing)$/.test(last) && !/(ed|ing)$/.test(first));
}

const LY_NOUNS = new Set(["family", "supply", "assembly", "butterfly", "anomaly", "monopoly", "weekly", "monthly", "yearly", "friendly", "elderly", "italy", "jelly", "belly"]);

function isAdverb(word: string): boolean {
  return word.length >= 6 && word.endsWith("ly") && !LY_NOUNS.has(word);
}

function bestForm(candidate: Candidate): string {
  let best = "";
  let bestCount = -1;
  for (const [form, count] of candidate.forms) {
    const lowerBonus = form === form.toLowerCase() ? 0.1 : 0;
    if (count + lowerBonus > bestCount) {
      best = form;
      bestCount = count + lowerBonus;
    }
  }
  const allCaps = candidate.capitalized >= candidate.occurrences * 0.6;
  return allCaps ? best : capitalize(best.charAt(0).toLowerCase() + best.slice(1));
}

function containsPhrase(longer: string, shorter: string): boolean {
  return ` ${longer} `.includes(` ${shorter} `);
}

function selectConcepts(candidates: Map<string, Candidate>, limit: number): Candidate[] {
  const all = [...candidates.values()];
  const recurring = all.filter((c) => c.sentences.size >= 2);
  const absorbed = new Set<Candidate>();
  for (const candidate of all) {
    // One-off phrases that merely extend a recurring concept ("social media platforms" vs "social media").
    if (candidate.size > 2 && candidate.sentences.size === 1 && recurring.some((r) => r !== candidate && r.size >= 2 && containsPhrase(candidate.key, r.key))) {
      absorbed.add(candidate);
      continue;
    }
    // Fragments that cut through a recurring phrase ("heavy social" from "heavy social media use").
    if (candidate.size > 1 && candidate.sentences.size === 1) {
      const stems = new Set(candidate.key.split(" "));
      const [only] = candidate.sentences;
      const cuts = recurring.some(
        (r) => r !== candidate && r.size >= 2 && r.sentences.has(only) && !containsPhrase(candidate.key, r.key) && r.key.split(" ").some((s) => stems.has(s)),
      );
      if (cuts) {
        absorbed.add(candidate);
        continue;
      }
    }
    // Single words that mostly occur inside one stronger phrase ("human" inside "human attention").
    if (candidate.size === 1) {
      const cover = all.find((other) => {
        if (other === candidate || other.size < 2 || !containsPhrase(other.key, candidate.key)) return false;
        let overlap = 0;
        for (const s of candidate.sentences) if (other.sentences.has(s)) overlap++;
        return overlap / candidate.sentences.size >= 0.7 && other.score >= candidate.score * 0.8;
      });
      if (cover) absorbed.add(candidate);
    }
  }
  const sorted = all.filter((c) => !absorbed.has(c)).sort((a, b) => b.score - a.score || a.firstSentence - b.firstSentence);
  const selected: Candidate[] = [];
  const keys = new Set<string>();
  for (const candidate of sorted) {
    if (selected.length >= limit) break;
    const label = bestForm(candidate);
    const key = labelKey(label);
    if (keys.has(key)) continue;
    const stems = new Set(candidate.key.split(" "));
    // Skip sub-phrases that almost always appear inside an already selected longer phrase.
    const swallowed = selected.some((other) => {
      const otherStems = new Set(other.key.split(" "));
      if (otherStems.size <= stems.size) return false;
      if (![...stems].every((s) => otherStems.has(s))) return false;
      let overlap = 0;
      for (const s of candidate.sentences) if (other.sentences.has(s)) overlap++;
      return overlap / candidate.sentences.size >= 0.7;
    });
    if (swallowed) continue;
    // Skip longer phrases that only appear once and merely restate a stronger selected concept.
    if (candidate.size > 1 && candidate.sentences.size === 1 && selected.some((o) => o.key.split(" ").every((s) => stems.has(s)) && o.sentences.size > 2)) continue;
    keys.add(key);
    selected.push(candidate);
  }
  return selected;
}

function locate(sentence: Sentence, candidate: Candidate): { start: number; end: number } | null {
  const stems = candidate.key.split(" ");
  const { tokens } = sentence;
  for (let i = 0; i + stems.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < stems.length; j++) {
      if (tokens[i + j].stem !== stems[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return { start: tokens[i].start, end: tokens[i + stems.length - 1].end };
  }
  return null;
}

export function generateFromText(input: string): TextResult | null {
  const lines = input.replace(/\r\n?/g, "\n").replace(/https?:\/\/\S+/g, "").split("\n");
  const { title, body } = detectTitle(lines.filter((l, i) => i > 0 || l.trim().length > 0));
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const sentences: Sentence[] = [];
  paragraphs.forEach((paragraph, p) => {
    for (const text of splitSentences(paragraph)) {
      if (text.split(" ").length < 3 && !text.endsWith("?")) continue;
      sentences.push({ index: sentences.length, text, paragraph: p, tokens: tokenizeSentence(text) });
    }
  });
  if (sentences.length === 0) return null;

  const wordCount = sentences.reduce((sum, s) => sum + s.tokens.length, 0);
  const titleStems = title ? stemSet(title) : new Set<string>();
  const candidates = collectCandidates(sentences, titleStems);
  const conceptLimit = clamp(Math.round(8 + wordCount / 14), 9, 38);
  const selected = selectConcepts(candidates, conceptLimit + (title ? 0 : 1));
  if (selected.length < 3) return null;

  const builder = new GraphBuilder();
  const coreCandidate = title ? null : selected.shift() ?? null;
  const coreLabel = title ? truncate(capitalize(title), 80) : truncate(bestForm(coreCandidate as Candidate), 80);
  const coreId = builder.addNode({
    label: coreLabel,
    notes: truncate(sentences.slice(0, 2).map((s) => s.text).join(" "), 280),
    category: "concept",
    kind: "core",
  });
  if (!coreId) return null;

  // --- Co-occurrence ------------------------------------------------------
  const concepts = selected.filter((c) => labelKey(bestForm(c)) !== labelKey(coreLabel));
  const cooc = new Map<string, number>();
  const weight = (a: Candidate, b: Candidate) => cooc.get(pairKey(a.key, b.key)) ?? 0;
  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const a = concepts[i];
      const b = concepts[j];
      let w = 0;
      for (const s of a.sentences) if (b.sentences.has(s)) w += 1;
      const aParas = new Set([...a.sentences].map((s) => sentences[s].paragraph));
      const bParas = new Set([...b.sentences].map((s) => sentences[s].paragraph));
      for (const p of aParas) if (bParas.has(p)) w += 0.25;
      if (w > 0) cooc.set(pairKey(a.key, b.key), w);
    }
  }

  // --- Primary branches: central but mutually distinct --------------------
  const centrality = new Map<string, number>();
  for (const c of concepts) {
    let degree = 0;
    for (const o of concepts) if (o !== c) degree += weight(c, o);
    centrality.set(c.key, c.score + 0.35 * degree);
  }
  const primaryCount = clamp(Math.round(concepts.length / 4.5), 3, 7);
  const primaries: Candidate[] = [];
  const pool = [...concepts];
  while (primaries.length < primaryCount && pool.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    pool.forEach((c, i) => {
      let maxSim = 0;
      for (const p of primaries) maxSim = Math.max(maxSim, weight(c, p) / Math.max(1, Math.min(c.sentences.size, p.sentences.size)));
      const value = (centrality.get(c.key) ?? 0) * (1 - 0.7 * Math.min(1, maxSim));
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    });
    primaries.push(pool.splice(bestIndex, 1)[0]);
  }

  const ids = new Map<string, string>();
  const categoryOf = (c: Candidate): Category =>
    categorizePhrase(bestForm(c), { isProperNoun: c.capitalized >= Math.max(1, c.occurrences * 0.6), isExample: c.exampleCue });
  const notesFor = (c: Candidate): string => {
    let best = -1;
    let bestScore = -1;
    for (const s of c.sentences) {
      const others = concepts.filter((o) => o !== c && o.sentences.has(s)).length;
      const score = others - s * 0.001;
      if (score > bestScore) {
        best = s;
        bestScore = score;
      }
    }
    return best >= 0 ? sentences[best].text : "";
  };

  for (const p of primaries) {
    const category = categoryOf(p);
    const id = builder.addNode({ label: bestForm(p), notes: notesFor(p), category, kind: "planet" });
    if (id) ids.set(p.key, id);
  }

  // --- Attach remaining concepts to the branch they co-occur with most ----
  const parentOf = new Map<string, Candidate>();
  const childCount = new Map<string, number>();
  const maxChildren = Math.ceil((pool.length / Math.max(1, primaries.length)) * 1.8) + 1;
  const attached: Candidate[] = [];
  for (const c of pool.sort((a, b) => b.score - a.score)) {
    let parent: Candidate | null = null;
    let best = 0;
    for (const p of primaries) {
      const w = weight(c, p);
      if (w > best && (childCount.get(p.key) ?? 0) < maxChildren) {
        best = w;
        parent = p;
      }
    }
    for (const s of attached) {
      const w = weight(c, s);
      if (w >= 2 && w > best * 1.5 && parentOf.get(s.key) && primaries.includes(parentOf.get(s.key) as Candidate)) {
        best = w;
        parent = s;
      }
    }
    if (!parent) {
      // No shared sentence: fall back to the branch introduced closest in the text.
      parent = primaries.reduce((closest, p) =>
        Math.abs(p.firstSentence - c.firstSentence) < Math.abs(closest.firstSentence - c.firstSentence) ? p : closest,
      );
    }
    const category = categoryOf(c);
    const depth = primaries.includes(parent) ? 2 : 3;
    const id = builder.addNode({ label: bestForm(c), notes: notesFor(c), category, kind: kindForDepth(depth, category) });
    if (!id) continue;
    ids.set(c.key, id);
    parentOf.set(c.key, parent);
    childCount.set(parent.key, (childCount.get(parent.key) ?? 0) + 1);
    attached.push(c);
  }

  const relate = (a: Candidate, b: Candidate, fallbackFrom: Category, fallbackTo: Category): { source: Candidate; target: Candidate; relation: ReturnType<typeof inferRelationFromCategories> } => {
    for (const s of a.sentences) {
      if (!b.sentences.has(s)) continue;
      const sentence = sentences[s];
      const pa = locate(sentence, a);
      const pb = locate(sentence, b);
      if (!pa || !pb) continue;
      const [first, second, firstPos, secondPos] = pa.start <= pb.start ? [a, b, pa, pb] : [b, a, pb, pa];
      const inferred = inferRelationFromSentence(sentence.text, firstPos.end, secondPos.start);
      if (inferred) {
        return inferred.reversed ? { source: second, target: first, relation: inferred.relation } : { source: first, target: second, relation: inferred.relation };
      }
    }
    const relation = inferRelationFromCategories(fallbackFrom, fallbackTo);
    // Example edges read "example -> general idea".
    return relation === "example" ? { source: b, target: a, relation } : { source: a, target: b, relation };
  };

  // Core -> primary edges.
  for (const p of primaries) builder.addEdge(coreId, ids.get(p.key) ?? null, "related");
  // Tree edges.
  for (const c of attached) {
    const parent = parentOf.get(c.key);
    if (!parent) continue;
    const { source, target, relation } = relate(parent, c, categoryOf(parent), categoryOf(c));
    builder.addEdge(ids.get(source.key) ?? null, ids.get(target.key) ?? null, relation);
  }
  // Cross-links between strongly co-occurring concepts in different places of the tree.
  const placed = [...primaries, ...attached];
  const minWeight = placed.length > 18 ? 2 : 1;
  const pairs: Array<[Candidate, Candidate, number]> = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const w = weight(placed[i], placed[j]);
      if (w >= minWeight) pairs.push([placed[i], placed[j], w]);
    }
  }
  pairs.sort((x, y) => y[2] - x[2]);
  const crossLimit = Math.max(2, Math.round(placed.length * 0.3));
  let crossAdded = 0;
  for (const [a, b] of pairs) {
    if (crossAdded >= crossLimit) break;
    const idA = ids.get(a.key);
    const idB = ids.get(b.key);
    if (!idA || !idB || builder.hasEdge(idA, idB)) continue;
    const { source, target, relation } = relate(a, b, categoryOf(a), categoryOf(b));
    if (builder.addEdge(ids.get(source.key) ?? null, ids.get(target.key) ?? null, relation)) crossAdded++;
  }

  // Questions asked in the text become moons near the concept they mention most.
  const questions = sentences.filter((s) => s.text.endsWith("?") && s.text.length <= 160).slice(0, 3);
  for (const q of questions) {
    if (builder.full) break;
    const qStems = stemSet(q.text);
    let anchor: string = coreId;
    let best = 0;
    for (const c of placed) {
      const overlap = c.key.split(" ").filter((s) => qStems.has(s)).length;
      if (overlap > best && ids.get(c.key)) {
        best = overlap;
        anchor = ids.get(c.key) as string;
      }
    }
    const id = builder.addNode({ label: truncate(q.text, 90), notes: "A question raised in your text.", category: "question", kind: "moon" });
    builder.addEdge(anchor, id, "related");
  }

  // Anything left without a connection orbits the core.
  for (const node of builder.nodes) if (node.id !== coreId && builder.degree(node.id) === 0) builder.addEdge(coreId, node.id, "related");

  return { builder, title: title ? truncate(title, 80) : coreLabel, conceptCount: placed.length };
}
