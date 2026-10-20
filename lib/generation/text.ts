/** Language helpers shared by the generation pipeline. Heuristic, English-first, dependency free. */

const STOPWORD_LIST = `a about above across after afterwards again against all almost alone along already also although always am among amongst an and another any anyhow anyone anything anyway anywhere are around as at back be became because become becomes becoming been before beforehand behind being below beside besides between beyond both but by can cannot could did do does doing done down due during each eg e.g either else elsewhere enough etc even ever every everyone everything everywhere except few for former formerly from further get gets getting give given gives go goes going gone got had has have having he hence her here hereafter hereby herein hers herself him himself his how however i ie i.e if in indeed into is it its itself just keep kept last later latter least less let lets like likely made make makes making many may me meanwhile might mine more moreover most mostly much must my myself namely neither never nevertheless next no nobody none noone nor not nothing now nowhere of off often on once one ones only onto or other others otherwise our ours ourselves out over own per perhaps please put quite rather really same say says said see seem seemed seeming seems several she should since so some somehow someone something sometime sometimes somewhere still such than that the their theirs them themselves then thence there thereafter thereby therefore therein thereupon these they thing things this those though through throughout thru thus to together too toward towards under until up upon us use used uses using very via was way ways we well were what whatever when whence whenever where whereafter whereas whereby wherein whereupon wherever whether which while whither who whoever whole whom whose why will with within without would yet you your yours yourself yourselves im ive id youre dont doesnt didnt cant wont isnt arent wasnt werent its lot lots kind sort bit also new old big small good bad great many much able across really actually basically simply maybe probably definitely want wants need needs try tries trying think thought thinking know knows knew feel felt today tomorrow yesterday`;

export const STOPWORDS: ReadonlySet<string> = new Set(STOPWORD_LIST.split(/\s+/));

/** Words that carry intent in a question but are noise in a concept label. */
const QUESTION_LEADS = /^(how|why|what|when|where|who|which|is|are|can|could|should|would|does|do|will)\b\s*/i;

const SMALL_TITLE_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "via", "with"]);

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Lower-cased word tokens. Keeps internal hyphens/apostrophes ("long-term", "people's"). */
export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  if (!matches) return [];
  return matches.map((w) => w.replace(/['’]s$/, "").replace(/’/g, "'"));
}

export function isStopword(word: string): boolean {
  return STOPWORDS.has(word) || word.length < 2 || /^\d+$/.test(word);
}

export function contentWords(text: string): string[] {
  return tokenize(text).filter((w) => !isStopword(w));
}

/**
 * Light suffix-stripping stemmer. Only used for matching words with each other,
 * never for display. Deliberately conservative to avoid conflating unrelated words.
 */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;
  // Step 1: plurals, so "civilizations" and "civilization" continue down the same path.
  if (/ies$/.test(w) && w.length > 4) w = w.replace(/ies$/, "y");
  else if (/sses$/.test(w)) w = w.replace(/sses$/, "ss");
  else if (/[^s]s$/.test(w) && w.length > 3) w = w.slice(0, -1);
  // Step 2: one derivational / inflectional suffix.
  const rules: Array<[RegExp, string]> = [
    [/ization$/, "ize"],
    [/ational$/, "ate"],
    [/fulness$/, "ful"],
    [/iveness$/, "ive"],
    [/ments?$/, ""],
    [/ingly$/, ""],
    [/edly$/, ""],
    [/ing$/, ""],
    [/ed$/, ""],
    [/ly$/, ""],
    [/er$/, ""],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(w)) {
      const candidate = w.replace(pattern, replacement);
      if (candidate.length >= 3) {
        w = candidate;
        break;
      }
    }
  }
  // Collapse doubled final consonants produced by suffix removal ("planning" -> "plann" -> "plan").
  if (/([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
  if (w.endsWith("e") && w.length > 4 && !/[aiou]ne$/.test(w)) w = w.slice(0, -1);
  return w;
}

export function stemSet(text: string): Set<string> {
  return new Set(contentWords(text).map(stem));
}

export function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / (a.size + b.size - shared);
}

export function sharedCount<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared;
}

/** Sentence splitter that tolerates common abbreviations and decimals. */
export function splitSentences(text: string): string[] {
  const protectedText = text
    .replace(/\b(e\.g|i\.e|etc|vs|mr|mrs|ms|dr|prof|inc|ltd|fig|approx|no)\./gi, (m) => m.replace(/\./g, "§"))
    .replace(/(\d)\.(\d)/g, "$1§$2");
  const parts = protectedText
    .split(/(?<=[.!?…])\s+(?=["'“‘(\[]?[\p{Lu}\p{N}])|\n{2,}|\n(?=\s*[-*•\d\p{Lu}])/u)
    .map((s) => normalizeWhitespace(s.replace(/§/g, ".")))
    .filter((s) => s.length > 0);
  return parts;
}

export function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Title Case for short labels, keeping acronyms and small words intact. */
export function titleCase(text: string): string {
  return text
    .split(" ")
    .map((word, i) => {
      if (word.length === 0) return word;
      if (/[A-Z]/.test(word.slice(1)) || /^[A-Z0-9]+$/.test(word)) return word;
      if (i > 0 && SMALL_TITLE_WORDS.has(word.toLowerCase())) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Sentence-case a phrase unless it already contains deliberate capitalisation. */
export function displayCase(phrase: string): string {
  const trimmed = normalizeWhitespace(phrase);
  return capitalize(trimmed);
}

export function truncate(text: string, max: number): string {
  const clean = normalizeWhitespace(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, "")}…`;
}

/** Removes list markers, markdown emphasis and stray punctuation from a single line. */
export function cleanLine(line: string): string {
  return normalizeWhitespace(
    line
      .replace(/^\s*(?:[-*•–—+>]|\d+[.)]|\[[ xX]?\])\s*/, "")
      .replace(/^#+\s*/, "")
      .replace(/\*\*|__|`/g, "")
      .replace(/^["“'‘]+|["”'’]+$/g, ""),
  );
}

/** Strips a leading interrogative so "How does memory work?" can become a concept label. */
export function stripQuestionLead(text: string): string {
  return normalizeWhitespace(text.replace(/[?!.]+$/, "").replace(QUESTION_LEADS, ""));
}

export function isQuestion(text: string): boolean {
  const t = text.trim();
  return t.endsWith("?") || /^(how|why|what|when|where|who|which|should|could|would|is there|are there|can i|can we|do i|does)\b/i.test(t);
}

/** Normalised comparison key used to detect duplicate labels. */
export function labelKey(label: string): string {
  // Numbers are kept: "Read 20 books" and "Read 30 books" are different thoughts.
  const words = tokenize(label).filter((w) => !STOPWORDS.has(w) && (w.length >= 2 || /^\d+$/.test(w)));
  return words.map(stem).sort().join(" ") || label.toLowerCase().trim();
}
