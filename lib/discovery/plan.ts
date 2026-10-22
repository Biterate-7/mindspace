import type { ProviderKind, SearchProviderId } from "@/types/research";
import { isStopword, normalizeWhitespace } from "@/lib/generation/text";

/**
 * Research planning: turns a question into topic facets and a set of complementary
 * queries, one shape per kind of index. Deterministic keyword cues, no language model —
 * the plan is shown to the user ("Searched for …") so it can be judged and corrected.
 *
 * Web engines get the question as written plus an angle suited to the topic; scholarly,
 * news and technical indexes match keywords, so they get the question's key terms.
 */

export type Facet = "science" | "health" | "software" | "technology" | "news" | "economics" | "policy" | "history" | "general";

export const FACET_LABELS: Record<Facet, string> = {
  science: "Science",
  health: "Life sciences & health",
  software: "Software",
  technology: "Technology",
  news: "Current events",
  economics: "Economics",
  policy: "Law & policy",
  history: "History",
  general: "General",
};

const FACET_CUES: Array<[Facet, RegExp]> = [
  [
    "health",
    /\b(health|medic(al|ine|ines)|clinical|disease|diseases|cancer|tumou?rs?|diabetes|insulin|vaccin(e|es|ation)|virus(es)?|viral|covid|pandemic|epidemic|infection|immun(e|ity|ology)|antibiotics?|therap(y|ies)|drugs?|patients?|symptoms?|obesity|nutrition|diet|sleep|mental health|depression|anxiety|dementia|alzheimer'?s?|brain|neuro\w*|genes?|genetic\w*|genom\w*|dna|rna|proteins?|cells?|microbiome|bacteria|biolog\w*|metabolism|cardio\w*|heart|blood|surgery|hospital)\b/i,
  ],
  [
    "science",
    /\b(physics|quantum|entanglement|particles?|photons?|electrons?|atoms?|molecul\w*|chemi\w*|relativity|gravit\w*|black holes?|galax(y|ies)|cosmolog\w*|astronom\w*|astrophysics|planets?|exoplanets?|universe|dark matter|dark energy|thermodynamics|superconduct\w*|fusion|fission|nuclear|optics|lasers?|materials? science|geolog\w*|earthquakes?|volcan\w*|climate|ocean\w*|ecolog\w*|ecosystems?|species|evolution\w*|biodiversity|mathemat\w*|theorem|equations?|statistic(s|al)|scientific|science|experiment\w*)\b/i,
  ],
  [
    "software",
    /\b(programming|code|coding|software|javascript|typescript|python|rust|golang|java|kotlin|swift|c\+\+|c#|react|next\.?js|node\.?js|vue|svelte|django|rails|apis?|sdk|librar(y|ies)|frameworks?|databases?|sql|postgres\w*|mysql|sqlite|mongodb|redis|kubernetes|docker|containers?|compilers?|git|github|linux|async|await|concurrency|threads?|bugs?|debugg\w*|deploy\w*|frontend|backend|css|html|http|webassembly|wasm|devops|microservices?|refactor\w*|unit tests?|typescript)\b/i,
  ],
  [
    "technology",
    /\b(ai|artificial intelligence|machine learning|deep learning|neural networks?|llms?|language models?|chatgpt|robot\w*|automation|semiconductors?|chips?|gpus?|blockchain|crypto\w*|bitcoin|internet|5g|batter(y|ies)|electric vehicles?|evs?|self-driving|autonomous|quantum computing|cybersecurity|encryption|privacy|data centers?|cloud computing|smartphones?|technolog\w*|tech)\b/i,
  ],
  [
    "economics",
    /\b(econom\w*|inflation|deflation|interest rates?|gdp|recession|unemployment|employment|jobs report|tariffs?|trade|markets?|monetary|fiscal|tax(es|ation)?|debt|deficit|wages?|labou?r|poverty|inequality|financ\w*|banks?|central bank|federal reserve|prices?|housing|productivity|growth|investment|stocks?|bonds?|currency|exchange rates?|supply chains?)\b/i,
  ],
  [
    "policy",
    /\b(law|laws|legal|legislat\w*|regulat\w*|polic(y|ies)|government\w*|congress|parliament|senate|courts?|supreme court|elections?|vot(e|es|ing)|rights|immigration|bills?|acts?|treaty|treaties|sanctions|federal|ministry|governance|public sector|constitution\w*|lawsuit|antitrust|subsid(y|ies)|welfare)\b/i,
  ],
  [
    "history",
    /\b(histor(y|ical|ians?)|ancient|medieval|renaissance|centur(y|ies)|empires?|dynast(y|ies)|civili[sz]ations?|revolution|world war|cold war|colonial\w*|treaty of|reign|monarch\w*|archaeolog\w*|\d{1,2}(st|nd|rd|th)[- ]century|1[0-8]\d\d)\b/i,
  ],
  ["news", /\b(news|latest|breaking|announc\w*|this (week|month|year)|today|yesterday|recent(ly)?|current(ly)?|ongoing|update[sd]?|crisis|conflict|war in|protests?|summit)\b/i],
];

const RECENCY = /\b(latest|recent(ly)?|current(ly)?|today|now|this (week|month|year)|news|update[sd]?|ongoing|breaking|upcoming|forecast|outlook|20(2[4-9]|3\d))\b/i;

/** Words that carry the question's intent but make keyword indexes miss. */
const QUERY_NOISE = new Set(
  `why how what when where who which whom whose does did do is are was were can could should would will might explain explained explanation difference between impact impacts effect effects role cause causes caused contribute contributed contributes lead leads led relationship work works happen happens happened mean means important importance handle handling code best way ways get make write possible properly correctly affect affects affecting affected`.split(/\s+/),
);

export interface ResearchPlan {
  question: string;
  facets: Facet[];
  /** True when the question asks about recent or ongoing events. */
  recency: boolean;
  /** Key terms in the question's own wording and order. */
  terms: string[];
  /** The key terms as one keyword query. */
  keywords: string;
  /** At most four key terms, for indexes that AND every word. */
  short: string;
  /** Queries per kind of index; an empty list means the index is not relevant. */
  queries: Record<ProviderKind, string[]>;
  /** Providers worth asking for this topic (keyed providers are always asked). */
  providers: ReadonlySet<SearchProviderId>;
}

function keyTerms(question: string): string[] {
  const words = normalizeWhitespace(question.replace(/[?!.,;:()"“”]+/g, " ")).split(" ");
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const bare = word.replace(/^['’]+|['’]+$/g, "").replace(/['’]s$/i, "");
    const lower = bare.toLowerCase();
    if (!bare || seen.has(lower) || QUERY_NOISE.has(lower)) continue;
    // Keep acronyms and roman numerals ("AI", "II") even though they look like stop words.
    if (isStopword(lower) && !/^[A-Z0-9]{2,}$/.test(bare)) continue;
    seen.add(lower);
    terms.push(bare);
  }
  return terms.slice(0, 10);
}

export function detectFacets(question: string): Facet[] {
  const facets = FACET_CUES.filter(([, cue]) => cue.test(question)).map(([facet]) => facet);
  return facets.length ? facets : ["general"];
}

/** A second web query that looks at the topic from the angle its facets need. */
function webAngle(keywords: string, facets: readonly Facet[], recency: boolean): string {
  if (recency || facets.includes("news")) return `${keywords} latest news`;
  if (facets.includes("software")) return `${keywords} documentation`;
  if (facets.includes("health")) return `${keywords} research evidence`;
  if (facets.includes("science")) return `${keywords} explained research`;
  if (facets.includes("economics")) return `${keywords} data analysis`;
  if (facets.includes("policy")) return `${keywords} official policy`;
  if (facets.includes("history")) return `${keywords} historians analysis`;
  if (facets.includes("technology")) return `${keywords} analysis`;
  return `${keywords} overview`;
}

export function planResearch(question: string): ResearchPlan {
  const clean = normalizeWhitespace(question).slice(0, 400);
  const facets = detectFacets(clean);
  const recency = RECENCY.test(clean) || facets.includes("news");
  const terms = keyTerms(clean);
  const keywords = terms.join(" ") || clean;
  // Short queries drop terms of one or two letters, which some indexes reject.
  const short = terms.filter((t) => t.length >= 3).slice(0, 4).join(" ") || keywords;
  // Research, documents and code lag the calendar: "2026" in the question narrows them to nothing.
  const timeless = (q: string) => q.replace(/\b20\d\d\b/g, " ").replace(/\s+/g, " ").trim() || q;
  const has = (...wanted: Facet[]) => wanted.some((f) => facets.includes(f));

  const providers = new Set<SearchProviderId>(["brave", "tavily", "wikipedia"]);
  // Scholarly literature helps almost every topic except pure how-to programming questions.
  if (!(facets.length === 1 && facets[0] === "software") && !(facets.length === 1 && facets[0] === "news")) providers.add("openalex");
  if (has("science", "technology", "economics")) providers.add("arxiv");
  if (has("health")) providers.add("europepmc");
  // A history question about a treaty is not a question about this quarter's news or current regulations.
  const historical = has("history") && !recency;
  if (recency || has("news") || (has("policy") && !historical)) providers.add("gdelt");
  // Hacker News links out to the journalism, explainers and engineering posts people discuss.
  if (has("software", "technology", "science")) providers.add("hackernews");
  if (has("software")) {
    providers.add("github");
    providers.add("stackexchange");
  }
  if (has("policy", "economics") && !historical) providers.add("federalregister");
  if (has("economics") || (has("policy") && has("health", "general"))) providers.add("worldbank");

  const queries: Record<ProviderKind, string[]> = {
    web: [clean, webAngle(keywords, facets, recency)].filter((q, i, all) => q && all.indexOf(q) === i),
    encyclopedia: [keywords],
    scholarly: [timeless(keywords)],
    news: [short],
    // Repository and Q&A search ANDs every word, so they get the short form.
    technical: [timeless(short)],
    government: [timeless(short)],
  };
  return { question: clean, facets, recency, terms, keywords, short, queries, providers };
}
