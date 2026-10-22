# Mindspace

**Put your brain on a map.** Mindspace turns a topic, a pasted essay or a messy brain dump into an interactive, pixel‑art galaxy of connected ideas that you can explore, edit and export as an image.

Mindspace has two modes:

- **Create** — map your own thinking. Everything runs in the browser: no accounts, no API keys, no server-side storage. Generation is a local, deterministic heuristic engine — it never calls a language model, and the UI says so.
- **Discovery** — research a question with sources from the web. The Mindspace server searches and fetches public pages on your behalf; everything you collect (sources, concepts, notes, article text) is stored only in your browser. See [Discovery](#discovery).

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Development server (Turbopack)                 |
| `npm run build`     | Production build                               |
| `npm start`         | Serve the production build                     |
| `npm test`          | Unit tests (Vitest)                            |
| `npm run typecheck` | `tsc --noEmit` (strict)                        |
| `npm run lint`      | ESLint (Next.js core-web-vitals + TypeScript)  |
| `npm run check`     | All of the above, in order                     |

## What you can do

- **Create** from three modes: *Topic*, *Text* (paste an article or notes), or *Brain dump* (one thought per line). A live preview constellation updates as you type.
- **Explore**: pan/zoom, fit, minimap, search by title or notes (matches are marked on the canvas), focus mode on one idea and its neighbours.
- **Edit**: rename, write notes, change category or celestial body, add child or standalone ideas (double-click empty space), connect by dragging from a star's corner port or via the inspector's picker, change or reverse relationships, duplicate, delete — all undoable.
- **Organise**: re-run the layout on demand (animated, undoable); your manual positions are otherwise never reset.
- **Keep**: maps autosave to `localStorage` (debounced, flushed when the tab hides). Recent and saved (starred) maps live in the sidebar. Duplicate, delete (with undo) or clear all local data.
- **Export** a high-resolution PNG of the *whole* graph with a deep-space backdrop and an optional caption frame.

Press `?` in the workspace for the full keyboard map (`N`, `A`, `C`, `F`, `⇧F`, `/`, `+`/`-`, `Del`, `Ctrl/⌘+Z`, `Ctrl/⌘+⇧+Z`, `Ctrl/⌘+K`, …). Shortcuts pause while typing in a field.

## How generation works

`lib/generation/` is pure TypeScript with no browser dependencies:

- **Topic** — curated knowledge templates for common subjects (learning, startups, AI, civilisations, climate, space, habits, health, money, creativity, music, social media). Anything else gets a structured thinking scaffold chosen from the phrasing (why / how / future / comparison / pursuit / concept), labelled with the user's subject.
- **Text** — RAKE-style phrase extraction (stop-word runs, sub-phrase absorption, verb-fragment rejection), sentence co-occurrence clustering, diverse primary branches, relationships inferred from cue phrases between mentions (*because*, *leads to*, *such as*, *rather than*…). Notes are the source sentences; labels are the source wording.
- **Brain dump** — one idea per line, near-duplicate merging, clustering by shared keywords, loose links across clusters. Original wording is preserved.
- **Layout** — deterministic "planetary system" layout: each primary idea's children fan outward around it, systems are spaced by size, then a footprint-aware collision pass removes overlaps.

Relationships are suggestions, not facts; every one can be inspected, retyped or removed.

## Discovery

Open **Discovery** (telescope icon in the top bar or sidebar) and ask a question — *“Why did the Treaty of Versailles contribute to World War II?”*.

1. **Search.** The question is turned into a research plan (`lib/discovery/plan.ts`): topic facets (science, health, software, technology, current events, economics, policy, history) and several complementary queries — the question as written for web engines plus an angle suited to the topic, and its key terms for keyword indexes. The plan goes in parallel to every provider that fits the topic (see below); each has its own timeout and one retry, and its outcome — results, empty, failed, timed out, rate limited or not relevant — is shown as it streams in. Results are the providers' own titles, links, snippets, abstracts, authors and dates (labelled as such, never as article content), merged by identity (normalised URL, DOI, arXiv id, PubMed id, repository), with syndicated copies collapsed, then ranked by question relevance, source credibility, topic fit and recency, and picked for diversity (repeat sites are penalised and Wikipedia is limited to a few results). Each result is labelled with its kind of publisher (research, news, government, docs, code, discussion, reference…) and evidence role (primary, secondary, reference, opinion) — heuristics with their reasons shown, not verdicts.
2. **Import.** By default a new question imports the top 8 results from different sites automatically; you can also pick results, paste URLs, or paste text yourself. Each import shows its real stage — checking robots.txt, fetching, extracting, extracting concepts — and can be cancelled. Failures (blocked, not found, paywalled, robots-disallowed, unsupported file, timeout) are explained per source and never affect the others. When a paper's page can't be read but a scholarly index supplied its abstract, the abstract is analysed instead and the source says so; otherwise its metadata and link are kept and nothing is pretended. Failed pages can be retried or replaced with pasted text, recorded as *pasted by you*. Asking the same question again reopens its galaxy and adds only sources it doesn't already have.
3. **Map.** Each source becomes a satellite tagged with its kind and site; its concepts (themes, people, organisations, places, events, dates) become planets linked back by *extracted from* / *mentioned in* attribution links, and its strongest argument sentences that name those concepts become amber *claim* moons — verbatim quotes linked to the source(s) they come from and, by *evidence* links, to the concepts they are about. A concept or claim found in several sources is one node with one link per source, placed between them.
4. **Think and review.** Add your own ideas, connect them to concepts (optionally as a *hypothesis*, with your reasoning), and review every suggested link — automatic links start *unreviewed* and show the sentence that suggested them. Filters (my ideas · sources · concepts · unreviewed) dim everything else; selecting a source lights up its concepts, selecting a concept shows its sources and passages.
5. **Keep.** Workspaces autosave like maps and reopen later. Export a PNG of the galaxy, structured JSON (quoted source content, notes and article text are each opt-in), or copy the source list as Markdown.

### Search providers

Without any key, Discovery searches these free, public APIs — each only when the topic calls for it:

| Provider | Covers | Used for |
| --- | --- | --- |
| OpenAlex | 250M+ scholarly works, every discipline (with abstracts) | almost every topic |
| arXiv | physics, maths, CS, quantitative biology/finance, economics preprints | science, technology, economics |
| Europe PMC | life sciences and biomedicine, including all of PubMed | health and biology |
| GDELT | worldwide online news, last three months | current events, policy |
| Hacker News | the articles, explainers and engineering posts people discuss | science, technology, software |
| GitHub · Stack Overflow | repositories and programming Q&A | software |
| Federal Register · World Bank | US federal documents; development research and reports | economics, policy |
| Wikipedia | reference — one source among many | every topic, capped |

General web search adds the broadest coverage (any website: official documentation, news sites, government and university pages) and is strongly recommended:

| Variable | Effect |
| --- | --- |
| `BRAVE_SEARCH_API_KEY` | Web search with the [Brave Search API](https://api-dashboard.search.brave.com). |
| `TAVILY_API_KEY` | Web search with [Tavily](https://app.tavily.com). |
| `DISCOVERY_SEARCH_PROVIDER` | `brave` (default) or `tavily` when both keys are set. |
| `OPENALEX_API_KEY`, `GITHUB_TOKEN`, `STACKEXCHANGE_KEY` | Optional: raise those providers' anonymous quotas. |
| `DISCOVERY_CONTACT_EMAIL` | Optional: sent to OpenAlex as `mailto`. |
| `DISCOVERY_DISABLE_PROVIDERS` | Comma-separated provider ids to turn off. |
| `DISCOVERY_DISABLE_WIKIPEDIA` | `1` turns off the keyless Wikipedia search. |

Copy `.env.example` to `.env.local`, add a key and restart `npm run dev`. Keys are read only in server route handlers and are never sent to the browser; `/api/discovery/config` reports provider names, not keys. Every provider is one adapter behind the `SearchProvider` interface (`lib/discovery/server/providers/`), registered in `lib/discovery/server/search.ts`; the federated search (`federated.ts`) and ranking (`lib/discovery/rank.ts`, `classify.ts`) need no changes to add one. Provider pages and fetched articles are cached in server memory (10 and 30 minutes) so re-running research doesn't repeat requests. Results are never scraped from search-engine pages, and paywalls, logins and CAPTCHAs are never bypassed.

### How concepts are extracted

Analysis is local and deterministic (`lib/discovery/analyze/local.ts`), reusing the Create-mode phrase extractor: recurring noun phrases are scored, clause fragments and boilerplate are rejected, named things are typed with simple cues, and contrasting language (*however*, *critics*, *disputed*…) flags a concept for review. **Nothing is paraphrased or invented** — summaries are sentences quoted from the article, passages are verbatim, and descriptions are only shown when a source contains a definition. The UI labels this as an approximation, not semantic understanding. The analysis output type already distinguishes model-written summaries and descriptions, so a language-model provider can be added later behind the same interface; none is included today.

### Safety

Discovery fetches untrusted pages on the server, so `lib/discovery/server/net.ts` treats every URL as hostile:

- http/https only, ports 80/443, no embedded credentials, no internal host names (`localhost`, `*.local`, `*.internal`, single-label names…).
- Every hostname is resolved and **all** addresses must be public (private, loopback, link-local/cloud-metadata, CGNAT, multicast, reserved, and IPv4 embedded in IPv6 are refused). The socket is then pinned to the vetted address, so DNS rebinding cannot swap it.
- Redirects are followed manually (max 5) and each hop is validated again; loops are detected.
- 15 s timeout, 4 MB download cap (16 MB once decompressed, against compression bombs), HTML and plain text only.
- robots.txt is honoured; paywalls, logins and CAPTCHAs are never bypassed — the user can paste text they have access to instead.
- HTML is parsed into an inert server-side DOM (linkedom + Mozilla Readability); scripts never run and no source HTML is rendered in the app. Only plain text reaches the browser.
- Per-client rate limits on search (20/min) and import (40/min), at most 40 sources per workspace, 3 concurrent imports.

### Storage

Graph data (sources' metadata, concepts with passages, links, notes, review states, positions) lives in the same `localStorage` maps as Create mode, so undo/redo, autosave and existing maps keep working — older maps load unchanged. Full article text is kept separately in IndexedDB (`mindspace-content`), only in this browser, for re-analysis without refetching; it can be removed per source, and it is deleted with its source, its workspace or *Clear local data*.

## Project structure

```
app/                     layout, page, global styles (pixel design system)
components/create/       landing / creation screen, hero galaxy canvas, live preview
components/graph/        React Flow canvas, celestial node, cosmic edge, background, controls
components/workspace/    top bar, sidebar, inspector, dialogs, keyboard shortcuts
components/ui/           tooltip, dialog, toasts, pixel icons
lib/generation/          topic templates & frames, text extraction, brain dump, relations, layout
lib/graph/               pure graph ops, undo/redo history, emphasis/search, geometry
lib/space/               palettes, procedural pixel sprites, starfield & nebula painter
lib/storage/             localStorage driver (memory fallback) and validated map repository
lib/export/              export geometry (pure) and PNG rendering
app/api/discovery/       config, search and ingest route handlers (server only)
components/discovery/    launch screen, research panel, filters, source/concept/link inspectors, data export
lib/discovery/           URL helpers, ranking, local analysis, graph merge/removal, research layout, content store, export
lib/discovery/server/    SSRF-safe fetching, robots.txt, article extraction, federated search, provider registry, caching, rate limiting
lib/discovery/server/providers/  one adapter per search API (web, scholarly, news, technical, government)
lib/store/               zustand store (graph, library/persistence, UI slices)
tests/                   Vitest suites for generation, layout, editing, history, storage, export
```

## Notes

- Visuals: procedural pixel art rendered as crisp SVG paths (nodes) and nearest-neighbour canvases (background, hero galaxy). Animations respect `prefers-reduced-motion`.
- If browser storage is blocked, Mindspace keeps working for the session and says so.
- `html-to-image` is pinned to 1.11.11, the version React Flow's export guide recommends.
