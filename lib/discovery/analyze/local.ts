import type { Relation } from "@/types/graph";
import type { ConceptType } from "@/types/research";
import { bestForm as rawBestForm, collectCandidates, locate, selectConcepts, tokenizeSentence, VERBS, type Candidate, type Sentence } from "@/lib/generation/extract";
import { inferRelationFromSentence } from "@/lib/generation/relations";
import { contentWords, jaccard, labelKey, splitSentences, stem, stemSet, truncate } from "@/lib/generation/text";
import { clamp } from "@/lib/utils/random";
import type { AnalysisInput, AnalyzedConcept, AnalyzedRelation, SourceAnalysis } from "./types";

/**
 * Deterministic, local source analysis. It finds recurring phrases (RAKE-style),
 * types named things with simple cues, and quotes the sentences that mention them.
 * Nothing is paraphrased or invented: summaries and passages are verbatim sentences.
 * The result is explicitly approximate — it is keyword statistics, not understanding.
 */

const MAX_SENTENCES = 900;
const PASSAGE_CHARS = 320;

const BOILERPLATE = /(\b(cookies?|subscribe|newsletter|sign up|sign in|log in|all rights reserved|click here|terms of (use|service)|privacy policy|advertisement|share this|follow us|retrieved (on )?\d|archived from|jump to navigation)\b|©)/i;

/** Labels that are artefacts of web pages rather than ideas. */
const JUNK_LABELS = new Set(
  ["wikipedia", "article", "articles", "reference", "references", "external links", "retrieved", "archived", "edit", "isbn", "doi", "pmid", "page", "pages", "website", "copyright", "citation", "jstor", "main page", "read more", "see also", "image", "photo", "source", "sources"].map((l) => labelKey(l)),
);

const EVENT_WORDS = /\b(war|wars|treaty|revolution|crisis|conference|battle|depression|agreement|pact|accords?|olympics|election|summit|uprising|rebellion|massacre|invasion|recession|pandemic|reform|act|armistice|congress|crash|collapse|plan|declaration)\b/i;
const ORG_WORDS = /\b(league|nations|union|council|party|company|inc|corp|corporation|university|institute|association|bank|ministry|department|agency|office|bureau|service|authority|board|panel|committee|organi[sz]ation|society|foundation|group|army|navy|government|court|commission|parliament|assembly|federation|alliance|laborator(y|ies)|labs?|school|college|ipcc|nasa|noaa|un|who|nato|imf|bbc|cnn|reuters|openai|google|microsoft)\b/i;
const PLACE_WORDS = /\b(river|mountains?|city|sea|ocean|island|islands|valley|kingdom|empire|republic|province|state|county|region|basin|desert|coast|gulf|bay|lake|peninsula|territory|rhineland|europe|asia|africa|america|antarctica|arctic|germany|france|britain|england|scotland|ireland|italy|spain|portugal|russia|ukraine|poland|austria|hungary|belgium|netherlands|switzerland|sweden|norway|denmark|finland|greece|turkey|china|japan|korea|india|pakistan|iran|iraq|israel|egypt|canada|mexico|brazil|argentina|australia|nigeria|kenya|ethiopia|indonesia|vietnam|london|paris|berlin|moscow|washington|tokyo|beijing)\b/i;
/** Titles directly before a name, or reporting verbs directly after it. */
const PERSON_BEFORE = /\b(president|prime minister|chancellor|minister|king|queen|emperor|general|marshal|dr\.?|professor|prof\.?|sir|lord|mr\.?|mrs\.?|ms\.?|economist|historian|scientist|philosopher|author|founder|ceo|senator|dictator)\s+$/i;
const PERSON_AFTER = /^[’']?s?\s*(,[^,]{0,40},\s*)?(said|says|argued|argues|wrote|writes|believed|believes|claimed|claims|stated|warned|insisted|noted|observed|famously)\b/i;
const DEMONYM = /^\p{Lu}\p{Ll}+(an|ian|ese|ish|ch|ic|i)$/u;
const CONTRACTION = /['’](re|t|ll|ve|d|m)$/i;

/** Everyday verbs and filler nouns that make poor stand-alone concepts or phrase edges. */
const GENERIC_WORDS = new Set(
  `work works build builds start starts make get find take give look come go run try want need know think feel say tell ask seem call keep let begin show hear play move live hold bring write sit stand lose pay meet continue set learn change understand watch follow stop speak read add spend open walk win remember love appear buy wait serve die send expect stay fall cut reach kill remain raise pass sell report decide pull notice tend tends turn turns end ends use uses used doing done thing things lot lots way ways time times year years day days part case point fact number life kind sort ones someone something anything everything nothing stuff`.split(
    /\s+/,
  ),
);

/** Display label: the extractor's best surface form without a trailing possessive. */
function bestForm(c: Candidate): string {
  return rawBestForm(c).replace(/['’]s$/i, "");
}
const TENSION_CUE = /\b(however|critics?|disputed?|disputes|controvers(y|ial)|debated?|contrary to|myths?|overstated|exaggerated|disagree[sd]?|challenged|questioned|alternative (view|explanation)|on the other hand|others argue|revisionists?|counter-?argument)\b/i;
const ARGUMENT_CUE = /\b(argued?|argues|contends?|claims?|suggests? that|concludes?|concluded|because|therefore|led to|leads to|resulted in|contributed to|caused|causes|the (main|primary|key|major) (reason|cause|factor)s?|evidence (shows|suggests)|according to|this means|as a result)\b/i;
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RE = new RegExp(`\\b(?:(?:\\d{1,2}\\s+)?(?:${MONTHS})\\s+(?:\\d{1,2},\\s+)?)?(1[1-9]\\d{2}|20\\d{2})\\b`, "g");

function prepareSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  text.split(/\n{2,}/).forEach((paragraph, p) => {
    for (const raw of splitSentences(paragraph)) {
      if (sentences.length >= MAX_SENTENCES) return;
      const words = raw.split(/\s+/).length;
      if (words < 5 || words > 90 || BOILERPLATE.test(raw)) continue;
      // Complete sentences only: captions, headings and link labels rarely end with punctuation.
      if (!/[.!?…]["'”’)\]]*$/.test(raw)) continue;
      const letters = (raw.match(/\p{L}/gu) ?? []).length;
      if (letters < raw.length * 0.55) continue;
      sentences.push({ index: sentences.length, text: raw, paragraph: p, tokens: tokenizeSentence(raw) });
    }
  });
  return sentences;
}

function topCandidates(candidates: Map<string, Candidate>, limit: number): Map<string, Candidate> {
  if (candidates.size <= limit) return candidates;
  const sorted = [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  return new Map(sorted.map((c) => [c.key, c]));
}

function isProper(c: Candidate): boolean {
  return c.capitalized >= Math.max(1, c.occurrences * 0.6);
}

function typeOf(c: Candidate, label: string, sentences: Sentence[]): ConceptType {
  if (!isProper(c)) return c.size >= 2 && c.sentences.size >= 3 ? "theme" : "concept";
  if (EVENT_WORDS.test(label)) return "event";
  if (ORG_WORDS.test(label)) return "organization";
  if (PLACE_WORDS.test(label)) return "place";
  const words = label.split(/\s+/);
  const nameLike = words.length <= 3 && words.every((w) => /^\p{Lu}[\p{L}'’.-]+$/u.test(w));
  if (nameLike) {
    // A title right before the name ("President Wilson") or a reporting verb right after it ("Keynes argued").
    let cues = 0;
    for (const index of c.sentences) {
      const sentence = sentences[index].text;
      for (const form of c.forms.keys()) {
        const at = sentence.indexOf(form);
        if (at < 0) continue;
        if (PERSON_BEFORE.test(sentence.slice(Math.max(0, at - 30), at)) || PERSON_AFTER.test(sentence.slice(at + form.length, at + form.length + 60))) cues++;
      }
    }
    if (cues >= 1 && (words.length > 1 || cues >= 2)) return "person";
  }
  return "entity";
}

/** True when most occurrences continue straight into another content word, i.e. the phrase was cut short. */
function rightTruncated(c: Candidate, sentences: Sentence[]): boolean {
  let total = 0;
  let continued = 0;
  for (const index of c.sentences) {
    const sentence = sentences[index];
    const at = locate(sentence, c);
    if (!at) continue;
    total++;
    const next = sentence.tokens.find((t) => t.start >= at.end);
    if (next && !next.stop && /^[\s-]*$/.test(sentence.text.slice(at.end, next.start))) continued++;
  }
  return total > 0 && continued / total >= 0.6;
}

function questionOverlap(sentence: Sentence, questionStems: ReadonlySet<string>): number {
  if (questionStems.size === 0) return 0;
  let n = 0;
  const seen = new Set<string>();
  for (const t of sentence.tokens) {
    if (t.stop || seen.has(t.stem)) continue;
    seen.add(t.stem);
    if (questionStems.has(t.stem)) n++;
  }
  return n;
}

function definitionFor(c: Candidate, sentences: Sentence[]): string | undefined {
  const forms = [...c.forms.keys()].map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // "X is a …", "X was the …", "X refers to …" — a copula followed by an article, so "X was not allowed" does not count.
  const pattern = new RegExp(`^(?:the\\s+)?(?:${forms.join("|")})\\s+(?:\\([^)]*\\)\\s+)?(?:(?:is|are|was|were)\\s+(?:a|an|the|one of)\\b|refers to|denotes|is defined as)`, "i");
  const ordered = [...c.sentences].sort((a, b) => a - b);
  for (const index of ordered) {
    const text = sentences[index].text;
    if (pattern.test(text) && text.length <= 360) return text;
  }
  return undefined;
}

interface DateCandidate {
  year: string;
  forms: Map<string, number>;
  sentences: Set<number>;
}

function findDates(sentences: Sentence[]): DateCandidate[] {
  const byYear = new Map<string, DateCandidate>();
  for (const s of sentences) {
    for (const match of s.text.matchAll(DATE_RE)) {
      const year = match[1];
      const entry = byYear.get(year) ?? { year, forms: new Map(), sentences: new Set() };
      entry.forms.set(match[0], (entry.forms.get(match[0]) ?? 0) + 1);
      entry.sentences.add(s.index);
      byYear.set(year, entry);
    }
  }
  return [...byYear.values()].filter((d) => d.sentences.size >= 2).sort((a, b) => b.sentences.size - a.sentences.size || Number(a.year) - Number(b.year));
}

export function analyzeLocally({ text, title, question }: AnalysisInput): SourceAnalysis {
  const sentences = prepareSentences(text);
  const empty: SourceAnalysis = { provider: "local", approximate: true, summary: "", summaryKind: "extractive", keyPassages: [], concepts: [], relations: [] };
  if (sentences.length === 0) return empty;

  const questionStems = stemSet(question);
  const boost = new Set([...stemSet(title), ...questionStems]);
  const words = sentences.reduce((sum, s) => sum + s.tokens.length, 0);
  const limit = clamp(Math.round(6 + words / 450), 6, 12);
  const collected = collectCandidates(sentences, boost);
  // Long articles: dampen raw frequency (log scale) so a few very common single words
  // do not crowd out the multi-word phrases that carry the argument.
  for (const c of collected.values()) {
    const tf = c.sentences.size;
    if (tf > 1) c.score *= Math.log2(1 + tf) / tf;
  }
  const titleStems = stemSet(title);
  const titleSize = contentWords(title).length;
  const candidates = topCandidates(collected, 700);
  const filtered = selectConcepts(candidates, limit + 10).filter((c) => {
    const label = bestForm(c);
    const key = labelKey(label);
    if (JUNK_LABELS.has(key) || label.length > 60 || /^\d+$/.test(label)) return false;
    // Single short words are rarely meaningful concepts unless they are acronyms.
    if (c.size === 1 && label.length < 4 && !/^[A-Z0-9]{2,}$/.test(label)) return false;
    // Nationality adjectives ("German", "French") describe other concepts rather than being one.
    if (c.size === 1 && DEMONYM.test(label) && isProper(c)) return false;
    // Verb fragments: "Signed", "Treaty required Germany". Proper names ending in -ing/-ed are kept.
    const words = label.split(/\s+/);
    if (!isProper(c) && words.length === 1 && /(ed|ing)$/i.test(label)) return false;
    if (words.slice(1).some((w) => /^\p{Ll}+ed$/u.test(w))) return false;
    // Contractions ("You're", "Don't") and phrases that start or end on an everyday verb ("Find startup ideas").
    if (words.some((w) => CONTRACTION.test(w))) return false;
    const first = words[0].toLowerCase();
    const last = words[words.length - 1].toLowerCase();
    const verbish = (w: string) => [w, w.replace(/s$/, ""), w.replace(/es$/, "")].some((form) => GENERIC_WORDS.has(form) || VERBS.has(form));
    if (!isProper(c) && (verbish(first) || (words.length === 1 ? false : GENERIC_WORDS.has(last) || VERBS.has(last)))) return false;
    // A verb inside the phrase means it spans a clause ("rangers ask visitors").
    if (!isProper(c) && words.length > 2 && words.slice(1, -1).some((w) => verbish(w.toLowerCase()))) return false;
    if (!isProper(c) && words.length === 1 && GENERIC_WORDS.has(first)) return false;
    // Single-word fragments of the page title ("Treaty" from "Treaty of Versailles") restate the source itself.
    if (c.size === 1 && titleSize > 1 && titleStems.has(c.key)) return false;
    // Phrases cut off mid-way: usually followed directly by another content word
    // ("regional impact tipping [elements]", "overfishing removes [grazing fish]").
    if (!isProper(c) && c.size > 1 && rightTruncated(c, sentences)) return false;
    // Adverbs at either edge mark clause fragments ("rose sharply").
    if (!isProper(c) && words.length > 1 && [first, last].some((w) => w.length >= 6 && /ly$/.test(w) && !/(ily|ply|bly)$/.test(w))) return false;
    if (!isProper(c) && words.length === 2 && /ed$/.test(first)) return false;
    return true;
  });
  // A bare surname next to the full name ("Andreessen" and "Marc Andreessen") is the same person, and a
  // single word that mostly occurs inside a selected phrase ("States" in "United States") is a fragment of it.
  const fullNames = filtered.filter((c) => c.size > 1 && isProper(c)).map((c) => bestForm(c).toLowerCase());
  const phrases = filtered.filter((c) => c.key.includes(" "));
  const fragment = (c: Candidate) =>
    c.size === 1 &&
    phrases.some((p) => {
      if (!p.key.split(" ").includes(c.key)) return false;
      let shared = 0;
      for (const s of c.sentences) if (p.sentences.has(s)) shared++;
      return shared / c.sentences.size >= 0.5;
    });
  const selected = filtered.filter((c) => !(c.size === 1 && isProper(c) && fullNames.some((n) => n.endsWith(` ${bestForm(c).toLowerCase()}`))) && !fragment(c)).slice(0, limit);

  const maxScore = Math.max(...selected.map((c) => c.score), 1);
  const passagesFor = (indices: Iterable<number>, others: Candidate[]): string[] =>
    [...indices]
      .map((index) => {
        const s = sentences[index];
        const shared = others.filter((o) => o.sentences.has(index)).length;
        return { s, score: shared + questionOverlap(s, questionStems) * 1.5 - index * 0.001 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .sort((a, b) => a.s.index - b.s.index)
      .map(({ s }) => truncate(s.text, PASSAGE_CHARS));

  const concepts: AnalyzedConcept[] = selected.map((c) => {
    const label = bestForm(c);
    const description = definitionFor(c, sentences);
    const tension = [...c.sentences].some((index) => TENSION_CUE.test(sentences[index].text));
    return {
      label,
      type: typeOf(c, label, sentences),
      passages: passagesFor(c.sentences, selected.filter((o) => o !== c)),
      mentions: c.occurrences,
      salience: Math.round((c.score / maxScore) * 100) / 100,
      ...(description ? { description, descriptionKind: "quote" as const } : {}),
      ...(tension ? { tension } : {}),
    };
  });

  // Dates that recur are useful anchors (e.g. for history questions), capped at two.
  const conceptKeys = new Set(concepts.map((c) => labelKey(c.label)));
  for (const date of findDates(sentences).slice(0, 2)) {
    const forms = [...date.forms.entries()].sort((a, b) => b[1] - a[1]);
    const label = forms.length > 1 && forms[0][1] === forms[1][1] ? date.year : forms[0][0];
    if (conceptKeys.has(labelKey(label))) continue;
    concepts.push({
      label,
      type: "date",
      passages: passagesFor(date.sentences, selected),
      mentions: [...date.forms.values()].reduce((a, b) => a + b, 0),
      salience: 0.3,
    });
  }

  // --- Extractive summary: the most representative sentences, quoted in order. -----
  const conceptPresence = (s: Sentence) => selected.reduce((sum, c) => sum + (c.sentences.has(s.index) ? c.score / maxScore : 0), 0);
  const scored = sentences
    .map((s) => ({
      s,
      score: (conceptPresence(s) + questionOverlap(s, questionStems) * 0.8 + (s.index < sentences.length * 0.15 ? 0.6 : 0)) / (1 + s.tokens.length / 40),
    }))
    .sort((a, b) => b.score - a.score);
  const summarySentences: Sentence[] = [];
  let summaryLength = 0;
  for (const { s } of scored) {
    if (summarySentences.length >= 3) break;
    if (summaryLength + s.text.length > 720 && summarySentences.length > 0) continue;
    const stems = new Set(s.tokens.filter((t) => !t.stop).map((t) => t.stem));
    if (summarySentences.some((o) => jaccard(stems, new Set(o.tokens.filter((t) => !t.stop).map((t) => t.stem))) > 0.45)) continue;
    summarySentences.push(s);
    summaryLength += s.text.length;
  }
  summarySentences.sort((a, b) => a.index - b.index);
  const summaryIndices = new Set(summarySentences.map((s) => s.index));
  const summary = summarySentences.map((s) => s.text).join(" ");

  // --- Key arguments: sentences that state a claim or causal link, quoted. ---------
  const keyPassages = sentences
    .filter((s) => ARGUMENT_CUE.test(s.text) && !summaryIndices.has(s.index))
    .map((s) => ({ s, score: conceptPresence(s) + questionOverlap(s, questionStems) * 1.2 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .sort((a, b) => a.s.index - b.s.index)
    .map(({ s }) => truncate(s.text, 360));

  // --- Suggested relations from shared sentences and cue phrases. -------------------
  const pairs: Array<{ a: Candidate; b: Candidate; shared: number[] }> = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const shared = [...selected[i].sentences].filter((s) => selected[j].sentences.has(s));
      if (shared.length >= (selected.length > 10 ? 2 : 1)) pairs.push({ a: selected[i], b: selected[j], shared });
    }
  }
  const relations: Array<AnalyzedRelation & { weight: number }> = [];
  for (const { a, b, shared } of pairs) {
    let relation: Relation = "related";
    let from = a;
    let to = b;
    let evidence = sentences[shared[0]].text;
    for (const index of shared) {
      const sentence = sentences[index];
      const pa = locate(sentence, a);
      const pb = locate(sentence, b);
      if (!pa || !pb) continue;
      const [first, second, fp, sp] = pa.start <= pb.start ? [a, b, pa, pb] : [b, a, pb, pa];
      const inferred = inferRelationFromSentence(sentence.text, fp.end, sp.start);
      if (inferred) {
        relation = inferred.relation;
        [from, to] = inferred.reversed ? [second, first] : [first, second];
        evidence = sentence.text;
        break;
      }
    }
    relations.push({ from: bestForm(from), to: bestForm(to), relation, evidence: truncate(evidence, PASSAGE_CHARS), weight: shared.length + (relation === "related" ? 0 : 1.5) });
  }
  relations.sort((x, y) => y.weight - x.weight);

  return {
    provider: "local",
    approximate: true,
    summary,
    summaryKind: "extractive",
    keyPassages,
    concepts,
    relations: relations.slice(0, Math.round(selected.length * 1.2)).map((r) => ({ from: r.from, to: r.to, relation: r.relation, evidence: r.evidence })),
  };
}

/** Content words of a question, for matching concepts against it. */
export function questionTerms(question: string): Set<string> {
  return new Set(contentWords(question).map(stem));
}
