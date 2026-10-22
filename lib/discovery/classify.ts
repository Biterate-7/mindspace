import type { SearchProviderId, SourceCategory, SourceRole } from "@/types/research";
import type { Facet } from "./plan";

/**
 * Heuristic source typing: what kind of publisher a result comes from, whether it is
 * primary evidence, secondary analysis, reference material or opinion, and a small
 * quality prior with the plain-language reasons behind it.
 *
 * These are labels to help a reader weigh sources, not verdicts. An academic-looking
 * address is not trusted on its own: a result counts as academic only when a scholarly
 * index returned it or it lives on a known publisher or repository.
 */

export interface Classification {
  category: SourceCategory;
  role: SourceRole;
  /** -1 (avoid) … 1 (strong), before topic fit and relevance. */
  quality: number;
  signals: string[];
  preprint: boolean;
}

export interface ClassifyInput {
  url: string;
  domain: string;
  title: string;
  provider: SearchProviderId;
  venue?: string;
  citedBy?: number;
  preprint?: boolean;
  hints?: string[];
}

const SCHOLARLY_PROVIDERS: ReadonlySet<SearchProviderId> = new Set(["openalex", "arxiv", "europepmc"]);

function matches(domain: string, list: readonly string[]): boolean {
  return list.some((d) => domain === d || domain.endsWith(`.${d}`));
}

const PREPRINT_HOSTS = ["arxiv.org", "biorxiv.org", "medrxiv.org", "ssrn.com", "osf.io", "preprints.org", "researchsquare.com", "chemrxiv.org", "psyarxiv.com"];

const ACADEMIC = [
  ...PREPRINT_HOSTS,
  "doi.org",
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "europepmc.org",
  "nature.com",
  "science.org",
  "sciencedirect.com",
  "springer.com",
  "wiley.com",
  "tandfonline.com",
  "jstor.org",
  "plos.org",
  "frontiersin.org",
  "mdpi.com",
  "cell.com",
  "thelancet.com",
  "nejm.org",
  "bmj.com",
  "jamanetwork.com",
  "pnas.org",
  "acs.org",
  "iop.org",
  "aps.org",
  "ieee.org",
  "acm.org",
  "nber.org",
  "semanticscholar.org",
  "openreview.net",
  "aclanthology.org",
  "cambridge.org",
  "academic.oup.com",
  "sagepub.com",
  "annualreviews.org",
  "royalsocietypublishing.org",
  "elifesciences.org",
  "neurips.cc",
  "hal.science",
  "zenodo.org",
  "researchgate.net",
  "academia.edu",
];

const NEWS = [
  "reuters.com",
  "apnews.com",
  "bbc.co.uk",
  "bbc.com",
  "nytimes.com",
  "washingtonpost.com",
  "theguardian.com",
  "wsj.com",
  "ft.com",
  "economist.com",
  "bloomberg.com",
  "npr.org",
  "pbs.org",
  "cnn.com",
  "aljazeera.com",
  "nbcnews.com",
  "cbsnews.com",
  "abcnews.go.com",
  "politico.com",
  "politico.eu",
  "axios.com",
  "theatlantic.com",
  "newyorker.com",
  "latimes.com",
  "usatoday.com",
  "independent.co.uk",
  "telegraph.co.uk",
  "lemonde.fr",
  "spiegel.de",
  "dw.com",
  "france24.com",
  "cnbc.com",
  "time.com",
  "newsweek.com",
  "vox.com",
  "propublica.org",
  "theverge.com",
  "wired.com",
  "arstechnica.com",
  "techcrunch.com",
  "sciencenews.org",
  "newscientist.com",
  "scientificamerican.com",
  "quantamagazine.org",
  "phys.org",
  "sciencedaily.com",
  "hbr.org",
  "nikkei.com",
  "asia.nikkei.com",
  "scmp.com",
  "thehindu.com",
  "abc.net.au",
  "cbc.ca",
  "smh.com.au",
  "japantimes.co.jp",
  "straitstimes.com",
  "euronews.com",
  "foreignpolicy.com",
  "foreignaffairs.com",
  "theconversation.com",
  "statnews.com",
];

const REFERENCE = ["wikipedia.org", "britannica.com", "plato.stanford.edu", "iep.utm.edu", "merriam-webster.com", "dictionary.com", "encyclopedia.com", "worldhistory.org", "scholarpedia.org", "wiktionary.org", "investopedia.com", "mathworld.wolfram.com", "ourworldindata.org"];

const INTERGOVERNMENTAL = ["europa.eu", "un.org", "who.int", "worldbank.org", "imf.org", "oecd.org", "bis.org", "wto.org", "unesco.org", "unicef.org", "ipcc.ch", "iea.org", "ilo.org", "unep.org", "undp.org", "nato.int", "fao.org", "wipo.int"];

const EDUCATIONAL = ["khanacademy.org", "coursera.org", "edx.org", "openstax.org", "libretexts.org", "physicsclassroom.com", "ocw.mit.edu", "hyperphysics.phy-astr.gsu.edu"];

const STANDARDS = ["w3.org", "rfc-editor.org", "ietf.org", "whatwg.org", "ecma-international.org", "iso.org", "developer.mozilla.org", "learn.microsoft.com", "docs.python.org", "doc.rust-lang.org", "go.dev", "nodejs.org", "readthedocs.io", "readthedocs.org", "devdocs.io", "kubernetes.io", "react.dev", "nextjs.org"];

const CODE = ["github.com", "gitlab.com", "bitbucket.org", "codeberg.org", "sourceforge.net", "npmjs.com", "pypi.org", "crates.io"];

const DISCUSSION = ["stackoverflow.com", "stackexchange.com", "superuser.com", "serverfault.com", "askubuntu.com", "reddit.com", "news.ycombinator.com", "quora.com", "lobste.rs", "discourse.org"];

const BLOG_HOSTS = ["medium.com", "substack.com", "blogspot.com", "wordpress.com", "dev.to", "hashnode.dev", "ghost.io", "tumblr.com", "livejournal.com"];

/** Homework mills, slide/document dumps and Q&A farms that rarely add original information. */
const LOW_QUALITY = ["pinterest.com", "answers.com", "ehow.com", "scribd.com", "coursehero.com", "studocu.com", "chegg.com", "brainly.com", "slideshare.net", "ezinearticles.com", "hubpages.com", "issuu.com", "ukessays.com", "papersowl.com", "bartleby.com", "ipl.org", "gradesaver.com"];

/** Portals that mostly republish other outlets' stories. */
const AGGREGATORS = ["msn.com", "news.yahoo.com", "news.google.com", "flipboard.com", "newsbreak.com", "ground.news", "inkl.com", "headtopics.com", "newsnow.co.uk", "biztoc.com"];

const SEO_PATH = /(^|[/-])(top-?\d+|best-[a-z]+|coupons?|promo-codes?|casino|essay-(writing|help)|buy-|cheap-|vs-[a-z]+-which)([/-]|$)/i;
const OPINION_PATH = /\/(opinion|opinions|commentary|editorials?|op-?eds?|columns?|columnists?|perspectives?|letters|views)\//i;
/** Publishers whose URL paths say nothing about opinion (journal systems use /article/view/…). */
const NO_OPINION_PATHS: ReadonlySet<SourceCategory> = new Set(["academic", "government", "documentation", "code", "reference"]);
const ANALYSIS_PATH = /\/(analysis|explainer|explained|features?|long-?reads?)\//i;
const REVIEW_TITLE = /\b(review|survey|meta-analys[ie]s|overview|state of the art|tutorial|primer|perspective|a guide)\b/i;

function isGovernment(domain: string): boolean {
  return /(^|\.)(gov|mil)$/.test(domain) || /(^|\.)(gov|gouv|gob|govt|go|gc|mil)\.[a-z]{2}$/.test(domain) || matches(domain, INTERGOVERNMENTAL);
}

function isEducational(domain: string): boolean {
  return /(^|\.)edu$/.test(domain) || /(^|\.)(edu|ac)\.[a-z]{2}$/.test(domain) || /(^|\.)uni-[a-z-]+\.de$/.test(domain) || matches(domain, EDUCATIONAL);
}

function isDocumentation(domain: string, path: string): boolean {
  return /^(docs|developer|developers|devdocs|api|reference)\./.test(domain) || matches(domain, STANDARDS) || /\/(docs|documentation|reference|manual|api-reference|guide)\b/i.test(path);
}

function newsLike(domain: string, path: string): boolean {
  return matches(domain, NEWS) || /(^|\.)(news|times|post|herald|tribune|gazette|chronicle|telegraph|guardian|observer|courier|independent)[a-z-]*\./.test(domain) || /\/(news|world|politics|business)\/\d{4}\//.test(path);
}

export function classifySource(input: ClassifyInput): Classification {
  const domain = input.domain.toLowerCase();
  let path = "";
  try {
    path = new URL(input.url).pathname;
  } catch {
    // Unparseable addresses never reach ranking; keep the classifier total anyway.
  }
  const signals: string[] = [];
  let category: SourceCategory;
  let role: SourceRole;
  let quality = 0;
  // A provider's explicit answer wins: an arXiv copy of a published paper is not "only a preprint".
  const preprint = input.preprint ?? matches(domain, PREPRINT_HOSTS);

  if (matches(domain, LOW_QUALITY)) {
    category = "web";
    role = "secondary";
    quality = -0.8;
    signals.push("Content-farm or document-dump site — rarely the original source");
  } else if (matches(domain, AGGREGATORS)) {
    category = "news";
    role = "secondary";
    quality = -0.5;
    signals.push("News aggregator — usually republishes other outlets");
  } else if (SCHOLARLY_PROVIDERS.has(input.provider) || matches(domain, ACADEMIC)) {
    category = "academic";
    role = REVIEW_TITLE.test(input.title) ? "secondary" : "primary";
    quality = 0.35;
    if (SCHOLARLY_PROVIDERS.has(input.provider)) signals.push(`Indexed by ${input.provider === "openalex" ? "OpenAlex" : input.provider === "arxiv" ? "arXiv" : "Europe PMC"}`);
    if (input.venue) signals.push(`Published in ${input.venue}`);
    if (preprint) {
      quality -= 0.1;
      signals.push("Preprint — not peer reviewed");
    }
    if (typeof input.citedBy === "number" && input.citedBy > 0) {
      quality += Math.min(0.3, Math.log10(input.citedBy + 1) * 0.1);
      signals.push(`Cited ${input.citedBy.toLocaleString("en-US")} time${input.citedBy === 1 ? "" : "s"}`);
    }
    if (role === "secondary") signals.push("Review or survey — synthesises other work");
  } else if (isGovernment(domain)) {
    category = "government";
    role = "primary";
    quality = 0.45;
    signals.push(matches(domain, INTERGOVERNMENTAL) ? "Intergovernmental organisation" : "Official government source");
  } else if (matches(domain, REFERENCE)) {
    category = "reference";
    role = "reference";
    quality = domain.endsWith("wikipedia.org") ? 0.1 : 0.2;
    signals.push(domain.endsWith("wikipedia.org") ? "Encyclopedia — check its cited sources" : "Reference work");
  } else if (matches(domain, CODE)) {
    category = "code";
    role = "primary";
    quality = 0.15;
  } else if (matches(domain, DISCUSSION)) {
    category = "discussion";
    role = "opinion";
    quality = domain === "quora.com" ? -0.4 : -0.05;
    signals.push("Community discussion — individual views");
  } else if (isDocumentation(domain, path)) {
    category = "documentation";
    role = "primary";
    quality = 0.4;
    signals.push("Official documentation or standard");
  } else if (isEducational(domain)) {
    category = "educational";
    role = "secondary";
    quality = 0.35;
    signals.push("University or educational institution");
  } else if (newsLike(domain, path)) {
    category = "news";
    role = "secondary";
    quality = matches(domain, NEWS) ? 0.35 : 0.1;
    if (matches(domain, NEWS)) signals.push("Established news or science publication");
  } else if (matches(domain, BLOG_HOSTS) || /^blog\./.test(domain) || /\/blog\//i.test(path)) {
    category = "blog";
    role = "secondary";
    quality = -0.05;
    signals.push("Blog post — personal or company perspective");
  } else if (/\.org$/.test(domain)) {
    category = "organization";
    role = "secondary";
    quality = 0.05;
  } else {
    category = "web";
    role = "secondary";
    // Journal-like names outside any index are not given academic standing.
    if (/journal|research|science|academ/i.test(domain)) signals.push("Journal-like site not found in a scholarly index");
  }

  if (!NO_OPINION_PATHS.has(category) && OPINION_PATH.test(path)) {
    role = "opinion";
    signals.push("Opinion or commentary section");
  } else if (category === "news" && ANALYSIS_PATH.test(path)) {
    signals.push("Analysis or explainer");
  }
  if (category !== "academic" && SEO_PATH.test(path)) {
    quality -= 0.4;
    signals.push("Listicle or SEO-style page");
  }
  for (const hint of input.hints ?? []) signals.push(hint);
  return { category, role, quality, signals, preprint };
}

/** How well each kind of source serves a topic facet (-1 … 1). */
const AFFINITY: Record<Facet, Partial<Record<SourceCategory, number>>> = {
  science: { academic: 0.5, educational: 0.35, reference: 0.15, news: 0.1, government: 0.15, organization: 0.05, documentation: -0.2, code: -0.1, discussion: -0.25 },
  health: { academic: 0.5, government: 0.4, educational: 0.2, news: 0.1, reference: 0.1, organization: 0.05, discussion: -0.35, blog: -0.2, code: -0.3 },
  software: { documentation: 0.6, code: 0.45, discussion: 0.25, blog: 0.2, educational: 0.1, academic: -0.1, government: -0.2 },
  technology: { news: 0.25, academic: 0.25, documentation: 0.2, code: 0.2, blog: 0.1, discussion: 0.05, educational: 0.1 },
  news: { news: 0.6, government: 0.35, organization: 0.05, reference: -0.1, academic: -0.15, blog: -0.1, code: -0.4 },
  economics: { government: 0.5, academic: 0.35, news: 0.25, educational: 0.15, organization: 0.1, reference: 0.05, code: -0.4 },
  policy: { government: 0.55, news: 0.3, academic: 0.25, organization: 0.1, code: -0.4 },
  history: { academic: 0.35, educational: 0.35, reference: 0.25, organization: 0.1, government: 0.1, news: -0.05, code: -0.5, discussion: -0.2 },
  general: { reference: 0.2, educational: 0.2, news: 0.15, academic: 0.15, government: 0.15, organization: 0.05 },
};

export function topicFit(category: SourceCategory, facets: readonly Facet[]): number {
  if (facets.length === 0) return 0;
  return facets.reduce((sum, f) => sum + (AFFINITY[f][category] ?? 0), 0) / facets.length;
}

export const CATEGORY_LABELS: Record<SourceCategory, string> = {
  academic: "Research",
  news: "News",
  reference: "Reference",
  government: "Government",
  documentation: "Docs",
  code: "Code",
  discussion: "Discussion",
  educational: "Education",
  organization: "Organisation",
  blog: "Blog",
  web: "Web",
};

export const ROLE_LABELS: Record<SourceRole, string> = {
  primary: "Primary",
  secondary: "Secondary",
  reference: "Reference",
  opinion: "Opinion",
};

export const ROLE_HINTS: Record<SourceRole, string> = {
  primary: "Original research, data, documents or official statements.",
  secondary: "Reporting, analysis or explanation of other sources.",
  reference: "Encyclopedic or reference summary.",
  opinion: "Commentary, discussion or personal view.",
};
