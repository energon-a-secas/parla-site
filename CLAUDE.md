# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Parla — Latin American Slang Map

Live at **parla.neorgon.com**. Searchable dictionary of Latin American slang with a visual radial diagram showing equivalent terms across 6 countries (CL, CO, AR, MX, PE, VE).

**Run:** `make serve` (port 8817) — ES modules require an HTTP server, not `file://`.

No build step, no dependencies, no tests.

---

## Architecture

Standard modular ES module app. Entry point is `js/app.js`.

**Data flow:**
1. `app.js` calls `loadDictionary()` → fetches `api/v1/dictionary.json` and builds an inverted search index in memory.
2. User types → `search()` in `data.js` runs 4 passes in priority order: exact match (score 3), prefix (score 2), contains (score 1), English meaning match (score 0). Results sorted by score.
3. Single result → `showDiagram()` directly. Multiple results → result cards list. Clicking a card calls `showDiagram()`.
4. `showDiagram()` handles URL hash (`#w=<concept-id>`) via `history.pushState` and popstate so browser back/forward works correctly.

**Diagram layout** (`render.js` → `showDiagram` → `layoutDiagram`):
- Countries have fixed angular sectors (clockwise from top: MX, CO, VE, PE, CL, AR).
- Nodes are positioned by averaging their countries' sector angles; multi-country nodes go further out.
- 50-iteration overlap resolution using measured node bounding boxes, then clamped to container bounds.
- SVG `<path>` connectors drawn from center to each node using quadratic bezier curves.
- Runs inside `requestAnimationFrame` after DOM settles so `offsetWidth`/`offsetHeight` measurements are accurate.

**Background canvas** (`diagram.js` + `data/latam-outline.json`):
- Country coastlines from Natural Earth 110m (`ne_110m_admin_0_countries`), simplified and stored in `data/latam-outline.json`.
- Runs a continuous `requestAnimationFrame` loop — never stopped.
- Mouse/touch parallax: map drifts opposite to cursor at 1.5% scale, plus ambient sine drift.
- Layers drawn back-to-front: grid → land dot fill → country fills/strokes (per-country tint) → six city markers (app country colors) → cursor glow.
- Dot positions are precomputed on load/resize via point-in-polygon (not per frame).

**State persistence** (`state.js`):
- localStorage key: `parla-state`
- Only `activeCountry` and `activeCategory` are persisted. Query and diagram state are ephemeral.
- `diagramPushedState` (not persisted) tracks whether `showDiagram()` called `history.pushState` — used by the Back button and `popstate` handler to decide whether to call `history.back()` or just hide the diagram directly.

**Dictionary data model** (`api/v1/dictionary.json`):
```json
{
  "countries": { "CL": { "name": "Chile", "flag": "🇨🇱", "color": "#dc2626" }, ... },
  "concepts": [
    {
      "id": "cool",
      "meaning_en": "cool, awesome",
      "category": "adjectives",
      "variants": [
        { "term": "bacán", "countries": ["CL"] },
        { "term": "chévere", "countries": ["CO", "PE", "VE"], "note": "optional note" }
      ]
    }
  ]
}
```
- Categories: `greetings`, `insults`, `adjectives`, `work`
- `data/backup.json` is a reference copy of the dictionary — not loaded at runtime.

**Word of the day** is deterministically seeded by `YYYY * 10000 + MM * 100 + DD` modulo concept count, so it's stable for the entire day without any server.

**Search normalization** strips diacritics via `NFD` decomposition and removes non-alphanumeric characters, so searching "bacan" matches "bacán".

**Deep links:** `#w=<concept-id>` in the URL opens that concept's diagram on load. `openFromHash()` runs on init and on `hashchange`.

**Variant merging in `showDiagram()`:** before laying out nodes, variants with the same term (case-insensitive) are merged — their `countries` arrays are unioned and the first `note` wins. The matched term is placed in the center; all other grouped variants become outer nodes.

**Browse section:** `renderBrowse()` groups concepts by category. Each section shows the first 3 cards; the rest have class `hidden`. A "Ver N más" button per section toggles `.hidden` on the remaining cards via `events.js`.

**Keyboard shortcuts:** `/` focuses the search input; `Escape` closes the diagram (or clears search if no diagram is open).

---

## Key gotchas

- `$(id)` in `utils.js` caches element references by ID — do not call it before the DOM is ready, and avoid re-using IDs across dynamic re-renders.
- The diagram center element is re-rendered on every `showDiagram()` call, which inserts the Back/Share buttons. Event handlers for those buttons are delegated on `#diagramArea`, not attached to the buttons directly.
- `relayout()` in `render.js` is called on window resize — it only works if `s.activeConcept` is set and `#diagramArea` is visible.
- To add a new category, add entries to `CATEGORY_LABELS` and `CATEGORY_ICONS` in `utils.js` in addition to the dictionary data.
- To add a new country, add it to `api/v1/dictionary.json` under `countries`, add it to `COUNTRY_ORDER` in `render.js` (for sector placement), and add a city to `CITIES` and optional border segments to `BORDERS` in `diagram.js`.
