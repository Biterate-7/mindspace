# Mindspace

**Put your brain on a map.** Mindspace turns a topic, a pasted essay or a messy brain dump into an interactive, pixel‑art galaxy of connected ideas that you can explore, edit and export as an image.

Everything runs in the browser: no accounts, no API keys, no server-side storage. Generation is a local, deterministic heuristic engine — it never calls a language model, and the UI says so.

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
lib/store/               zustand store (graph, library/persistence, UI slices)
tests/                   Vitest suites for generation, layout, editing, history, storage, export
```

## Notes

- Visuals: procedural pixel art rendered as crisp SVG paths (nodes) and nearest-neighbour canvases (background, hero galaxy). Animations respect `prefers-reduced-motion`.
- If browser storage is blocked, Mindspace keeps working for the session and says so.
- `html-to-image` is pinned to 1.11.11, the version React Flow's export guide recommends.
