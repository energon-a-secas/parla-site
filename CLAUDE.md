# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Parla: Latin American Slang Map

Live at **parla.neorgon.com**. Searchable dictionary of Latin American slang on an interactive 3D globe, showing equivalent terms across 8 countries (CL, CO, AR, MX, PE, VE, BR, US).

US is the Spanglish entry: US Spanish shares most of its slang with Mexico, plus terms that exist only there (`la migra`, `janguear`, `la troca`, `parquear`). Its `variety` field renders as "Estados Unidos, Spanglish".

**Run:** `make serve` (port 8817): ES modules require an HTTP server, not `file://`.

No build step and no tests. One vendored runtime dependency: **three.js r160** in `vendor/three/`, resolved through an importmap in `index.html` and copied from the sibling `headpain-site` (same version, same pattern). Only `addons/controls/OrbitControls.js` is vendored alongside it.

---

## Architecture

Standard modular ES module app. Entry point is `js/app.js`.

**Data flow:**
1. `app.js` calls `loadDictionary()` → fetches `api/v1/dictionary.json` and builds an inverted search index in memory.
2. User types → `search()` in `data.js` runs 4 passes in priority order: exact match (score 3), prefix (score 2), contains (score 1), English meaning match (score 0). Results sorted by score.
3. Single result → `showDiagram()` directly. Multiple results → result cards list. Clicking a card calls `showDiagram()`.
4. `showDiagram()` handles URL hash (`#w=<concept-id>`) via `history.pushState` and popstate so browser back/forward works correctly.

**Radial diagram layout**: the no-WebGL fallback only (`render.js` → `showDiagram` → `layoutDiagram`):
- Country angles follow capital geography read from each country's `anchor` in the dictionary (north up: MX northwest, BR east, CL/AR south).
- Nodes are positioned by averaging their countries' angles; multi-country nodes go further out.
- 50-iteration overlap resolution using measured node bounding boxes, then clamped to container bounds.
- SVG `<path>` connectors drawn from center to each node using quadratic bezier curves.
- Runs inside `requestAnimationFrame` after DOM settles so `offsetWidth`/`offsetHeight` measurements are accurate.

**The globe is the diagram** (`globe3d.js`, `geo.js`, `overlay.js`, `collide.js`):
- `diagram.js` is the **facade and the only seam**. `render.js` and `events.js` import from it and never touch three, so app changes cannot regress the fallback.
- `initStage()` runs a WebGL pre-flight *before* importing three, so a device without WebGL never downloads the 656 KB. A second guard wraps `new THREE.WebGLRenderer()`. Either failure adds `body.no-webgl` and the original radial diagram takes over in the old top-bar document flow. **Force it with `?nogl=1`**, nobody exercises that path by accident.
- Scene layers, outward: ocean sphere (r=1.000) · graticule · world land (1.002) · other-Americas land (1.003) · focus country fill (1.006) · side wall · border · atmosphere (1.09). The raised plateau with a lit wall is what makes a country read as a solid, and it removes z-fighting.
- Country geometry is triangulated **in the browser** via `THREE.ShapeUtils.triangulateShape` (three bundles earcut), then each triangle is subdivided until every edge is under 1.5 degrees and projected onto the sphere. Without that subdivision **every one of the eight** sinks: a flat chord across the US spans 41 degrees and its midpoint sits 5.9% *below* the ocean radius, Brazil 5.3%, Chile 4.7%, and even Venezuela at 13 degrees does not clear it. The sea punches through the middle of the country. Subdivided, the residual sag is 8.6e-5 of the radius.
- The camera centres a country by **longitude and latitude**, interpolating in spherical coordinates so north stays up. The retired 2D globe rotated about one axis, so focusing a country only aligned its longitude: latitude stayed at -sin(lat) of the radius, leaving Mexico 33% above the centre and Argentina 57% below it, 90% of the radius apart while both were reported as centred. `frameCountries()` fits the view to a set; the home view uses a wider cap so all of Latin America fits.
- Rotation is clamped so Latin America cannot leave the screen: azimuth +/-32 degrees around 75W, polar 0.95 to 2.40 rad. **The azimuth window must never straddle +/-pi** or r160's angle normalisation locks rotation completely. The polar bounds must also admit every country anchor, or focusing one gets clamped short of centring it: Los Angeles at 34.05 N is the northern constraint, Buenos Aires at 34.6 S the southern one.
- `applyView()` flushes OrbitControls' damped momentum before moving the camera. Damping keeps applying leftover velocity from the user's last drag, which otherwise tugs every programmatic move off target and leaves it short.
- The home distance is derived from the aspect ratio, so **it changes on resize**. `resize()` refits when the camera was already home, `homeDistance()` clamps to what the controls actually allow, and `maxDistance` grows for portrait viewports. Comparing against the unclamped fit made `isHomeView()` permanently false on phones, so the reset control never went away.
- **Clicking a country sets the filter and opens the Explore sheet on it**; clicking the same country again clears both. The `#globeReset` control ("Ver todos los paises") clears the filter and returns home, and shows itself only when one of those would change something.
- Render-on-demand: frames are drawn only while something moves. There is deliberately **no idle spin**.
- `overlay.js` pins each term card to the screen centroid of its countries, draws a leader line per country, and pushes cards apart with `collide.js#separate` (shared with the radial fallback, so the two cannot drift). Card sizes are measured once per concept; re-measuring `offsetWidth` per frame would force a reflow at 60fps. Far-side cards are **rim-pinned, not hidden**. A term vanishing would break the cross-country mapping the map exists to show.
- Positions are written with the independent `translate` CSS property, which composes with the stylesheet's centring `transform` and stays a compositor-only write.

**Layout**: `body.globe-mode` makes the globe a full-viewport stage: search collapses to a floating bottom bar, results and browse live in a collapsible `.dock` sheet above it, and the footer runs `data-footer-mode="app" data-stick="off"`. The globe is centred in the band the dock leaves visible via a frustum offset (`setBottomInset`), not by aiming the camera off-centre.

**State persistence** (`state.js`):
- localStorage key: `parla-state`
- Only `activeCountry` and `activeCategory` are persisted. Query and diagram state are ephemeral.
- `diagramPushedState` (not persisted) tracks whether `showDiagram()` called `history.pushState`: used by the Back button and `popstate` handler to decide whether to call `history.back()` or just hide the diagram directly.

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
- Categories: `greetings`, `insults`, `adjectives`, `work`, `daily`

**Word of the day** is deterministically seeded by `YYYY * 10000 + MM * 100 + DD` modulo concept count, so it's stable for the entire day without any server.

**Search normalization** strips diacritics via `NFD` decomposition and removes non-alphanumeric characters, so searching "bacan" matches "bacán".

**Deep links:** `#w=<concept-id>` in the URL opens that concept's diagram on load. `openFromHash()` runs on init and on `hashchange`.

**Variant merging in `showDiagram()`:** before laying out nodes, variants with the same term (case-insensitive) are merged. Their `countries` arrays are unioned and the first `note` wins. The matched term is placed in the center; all other grouped variants become outer nodes.

**Browse section:** `renderBrowse()` groups concepts by category. Each section shows the first 3 cards; the rest have class `hidden`. A "Ver N más" button per section toggles `.hidden` on the remaining cards via `events.js`.

**Keyboard shortcuts:** `/` focuses the search input; `Escape` closes the diagram (or clears search if no diagram is open).

---

## Key gotchas

- `$(id)` in `utils.js` caches element references by ID: do not call it before the DOM is ready, and avoid re-using IDs across dynamic re-renders.
- The diagram center element is re-rendered on every `showDiagram()` call, which inserts the Back/Share buttons. Event handlers for those buttons are delegated on `#diagramArea`, not attached to the buttons directly.
- `relayout()` in `render.js` is called on window resize: it only works if `s.activeConcept` is set and `#diagramArea` is visible.
- To add a new category, add entries to `CATEGORY_LABELS` and `CATEGORY_ICONS` in `utils.js` in addition to the dictionary data.
- **To add a new country: add one entry to `api/v1/dictionary.json` under `countries` (with its `anchor` lon/lat), then run `make geometry`.** That is the whole procedure. The anchor is the single source of truth that `render.js`, the globe and the geometry build all read; it used to be duplicated in three places.
- `make coverage` validates every country code in the data and **exits non-zero on an unknown one**. This is the guard for the `_CL` class of typo, which rendered as literal text where a flag belonged and made the variant invisible to the CL filter.
- `scripts/build_geometry.py` re-downloads Natural Earth 1:50m. Its Douglas-Peucker has a zero-length-baseline guard: GeoJSON rings are closed, so `pts[0] == pts[-1]` and without the guard **every ring silently collapses to two points**. The script asserts a point-count floor to catch it.
- Categories now include `daily` ("Cotidiano"), ten concepts that carry a term for **all eight** countries. Opening one lights up the whole globe, which is the clearest demo of the map.
