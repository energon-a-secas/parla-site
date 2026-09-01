# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Parla: Latin American Slang Map

Live at **parla.neorgon.com**. Searchable dictionary of Latin American slang on an interactive 3D globe, showing equivalent terms across 8 countries (CL, CO, AR, MX, PE, VE, BR, US).

US is the Spanglish entry: US Spanish shares most of its slang with Mexico, plus terms that exist only there (`la migra`, `janguear`, `la troca`, `parquear`). Its `variety` field renders as "Estados Unidos, Spanglish".

**Run:** `make serve` (port 8817): ES modules require an HTTP server, not `file://`.

No build step and no npm. One vendored runtime dependency: **three.js r160** in `vendor/three/`, resolved through an importmap in `index.html` and copied from the sibling `headpain-site` (same version, same pattern). Only `addons/controls/OrbitControls.js` is vendored alongside it.

**Tests:** `make check` runs `tests/camerafit.test.mjs` under `node --test`, no dependencies. `make check-stage` opens `tests/stage.html`, which boots the app in sized iframes and asserts the layout invariants a node process cannot see. Both are described under Testing below.

---

## Architecture

Standard modular ES module app. Entry point is `js/app.js`.

**Data flow:**
1. `app.js` calls `loadDictionary()` → fetches `api/v1/dictionary.json` and builds an inverted search index in memory.
2. User types → `search()` in `data.js` runs 4 passes in priority order: exact match (score 3), prefix (score 2), contains (score 1), English meaning match (score 0). Results sorted by score, then by country relevance.
   - **The country filter ranks, it does not exclude.** Searching `laburo` while filtered to Chile used to report that the word does not exist, on a site whose purpose is telling you Argentina says `laburo` where Chile says `pega`. Three passes tested the matched variant's countries and the fourth tested the whole concept, so they disagreed about what the filter even meant. Within a score, a result whose matched variant is in the active country outranks one where only some other variant is, which outranks one with no connection.
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
- **The WebGL pre-flight is an inline script in `index.html`, immediately after `<body>`.** It is the only implementation; `webglSupported()` in `utils.js` just reads the `window.__parlaWebGL` it caches. It runs before the first paint and stamps `globe-mode` or `no-webgl` straight onto the body, so the stage layout is never corrected after load. It used to live at the end of `initStage()`, which meant the pre-globe document flow was painted for 207 ms on warm localhost and seconds on a real connection, because the decision sat behind 946 KB (dictionary 139 + three 655 + geometry 91 + OrbitControls 29). Being a plain check with no network, it never needed to wait for any of that. A second guard still wraps `new THREE.WebGLRenderer()`, and `fallback()` **removes** `globe-mode` as well as adding `no-webgl`: that is the one path that can still switch layout after load. **Force it with `?nogl=1`**, nobody exercises that path by accident.
- Because the body commits to `globe-mode` at parse time, `showConcept()` has to tell *no stage yet* from *no stage ever*. During the boot window it queues the concept in `pendingConcept` and returns `true`; `initStage()` flushes it once the overlay exists. Returning `false` there would let the radial fallback draw itself over the stage about to appear.
- Scene layers, outward: ocean sphere (r=1.000) · graticule · world land (1.002) · other-Americas land (1.003) · focus country fill (1.006) · side wall · border · atmosphere (1.09). The raised plateau with a lit wall is what makes a country read as a solid, and it removes z-fighting.
- Country geometry is triangulated **in the browser** via `THREE.ShapeUtils.triangulateShape` (three bundles earcut), then each triangle is subdivided until every edge is under 1.5 degrees and projected onto the sphere. Without that subdivision **every one of the eight** sinks: a flat chord across the US spans 41 degrees and its midpoint sits 5.9% *below* the ocean radius, Brazil 5.3%, Chile 4.7%, and even Venezuela at 13 degrees does not clear it. The sea punches through the middle of the country. Subdivided, the residual sag is 8.6e-5 of the radius.
- The camera centres a country by **longitude and latitude**, interpolating in spherical coordinates so north stays up. The retired 2D globe rotated about one axis, so focusing a country only aligned its longitude: latitude stayed at -sin(lat) of the radius, leaving Mexico 33% above the centre and Argentina 57% below it, 90% of the radius apart while both were reported as centred. `frameCountries()` fits the view to a set; the home view uses a wider cap so all of Latin America fits.
- **Every camera fit is solved against the band the dock leaves visible, not the canvas** (`camerafit.js`, a pure module with no three and no DOM, which is why it is testable). The dock covers the foot of the stage and `setBottomInset()` offsets the frustum to compensate, but the frustum's field of view still spans the whole canvas: a fit that ignores the inset draws the globe at up to twice the size the visitor can see. With the Explore sheet open the dock is 0.625 of the stage, so a selected country was drawn at roughly 2x with its neighbours off every edge. `MAX_INSET_FRACTION` (0.7) keeps a floor under the band, because the fit distance goes to infinity as the band goes to zero.
- **One country is framed at a fixed `FOCUS_FIT_ANGLE` (30 degrees), never to its own bounds.** Fitting each country to itself made the zoom a function of country size: Colombia is 9.8 degrees from Bogota and Chile 22.5 from Santiago, so clicking Colombia put the camera more than twice as close, and neither left a neighbour on screen to click next. 30 is the smallest angle containing every country whole except the US (40.3 degrees from Los Angeles), which is a declared exception in the test. A concept spanning several countries still fits them all, capped at `HOME_FIT_ANGLE`.
- Rotation is clamped so Latin America cannot leave the screen: azimuth +/-32 degrees around 75W, polar 0.95 to 2.40 rad. **The azimuth window must never straddle +/-pi** or r160's angle normalisation locks rotation completely. The polar bounds must also admit every country anchor, or focusing one gets clamped short of centring it: Los Angeles at 34.05 N is the northern constraint, Buenos Aires at 34.6 S the southern one.
- `applyView()` flushes OrbitControls' damped momentum before moving the camera. Damping keeps applying leftover velocity from the user's last drag, which otherwise tugs every programmatic move off target and leaves it short.
- The home distance is derived from the aspect ratio, so **it changes on resize**. `resize()` refits when the camera was already home, `homeDistance()` clamps to what the controls actually allow, and `maxDistance` grows for portrait viewports. Comparing against the unclamped fit made `isHomeView()` permanently false on phones, so the reset control never went away.
- **Clicking a country sets the filter and opens the Explore sheet on it**; clicking the same country again clears both. The `#globeReset` control ("Ver todos los paises") clears the filter and returns home, and shows itself only when one of those would change something. `Escape` is the fast route to the same place: it walks the word-of-day dialog, the open concept, the sheet, the query, and finally the country filter.
- **A country restored from localStorage keeps its filter and its highlight but does not move the camera.** `app.js` boots it with `focusCountry(code, { move: false })`. Flying into it opened the map on one country with no others in view and nothing on screen explaining why, which is the state most of this section's bugs were reported from.
- Render-on-demand: frames are drawn only while something moves. There is deliberately **no idle spin**.
- `overlay.js` pins each term card to the screen centroid of its countries, draws a leader line per country, and pushes cards apart with `collide.js#separate` (shared with the radial fallback, so the two cannot drift). Card sizes are measured once per concept; re-measuring `offsetWidth` per frame would force a reflow at 60fps. Far-side cards are **rim-pinned, not hidden**. A term vanishing would break the cross-country mapping the map exists to show.
- Positions are written with the independent `translate` CSS property, which composes with the stylesheet's centring `transform` and stays a compositor-only write.

**The country surface is two things, and they used to be one.** Clicking a country
sets the filter and opens the Explore sheet on it, so the **sheet is the country's
panel**: `render.js#renderCountryPanel` puts a head on it with the flag, the name,
the variety and a tally counted in the current mode ("192 palabras en 181
conceptos", or "9 expresiones"), plus a `Quitar` that runs the identical path as
the stage's `#globeReset`. It takes the intro line's slot rather than sitting above
it, because that line asks the visitor to pick a country they have just picked.
**Hovering is only a tip**: which country this is, and three of its words.

That split is a fix, not a preference. The tip used to be 275x295px of
`pointer-events: auto` positioned at `projectCountry(code).x + 18`, so on a
zoomed-in country it landed under the pointer that summoned it, took the pointer,
and the canvas fired `pointerleave`; the overlay hid it and the pointer was over
the canvas again. It did not come back until the mouse moved, because
`processHover()` only re-picks on a fresh `pointermove`, so the visible behaviour
was a flash-and-vanish on every twitch. Four rules keep it fixed, and each has a
test:

- **`pointer-events: none` on `.globe-card` is load-bearing.** Nothing in the tip
  is clickable, so it costs nothing, and it is the whole feedback loop. The stage
  suite asserts the property directly: `elementFromPoint` at the tip's centre must
  not land inside the tip.
- **`previewTerms()` in `data.js` replaced `sampleTerms()`**, which shuffled the
  country's entire variant list with `Math.random()` and took five. Every re-show
  drew a fresh five from every row the country appears in, which put `temprano`
  and `pedazo de mierda` in a tooltip about as often as actual slang. The rule now
  is the first concept of each category in file order, which is flagship order, so
  every country answers the same three questions and sweeping the pointer across
  the map shows one idea changing its word. `tests/preview.test.mjs` pins all 8x3
  words literally and keeps the retired shuffle around to prove the determinism
  check can fail.
- **No tip for the selected country.** Its panel is already open, and that is the
  state the flicker was reported from.
- **The tip is repositioned every frame and clamped into the band between the
  header and the dock.** It was placed once on show, so it was stale from the
  first frame of the tween `focusCountry()` starts; and being `z-index: 2` under a
  sticky header, a tall one clamped only to the viewport slid under the header and
  lost the country name it exists to give. Rows are one line each (term, then
  meaning) for the same reason: stacked, three rows came to 229px against a band
  of about 156px with the sheet open.

**Layout**: `body.globe-mode` makes the globe a full-viewport stage: search collapses to a floating bottom bar, results and browse live in a collapsible `.dock` sheet above it, and the footer runs `data-footer-mode="app" data-stick="off"`. The globe is centred in the band the dock leaves visible via a frustum offset (`setBottomInset`), not by aiming the camera off-centre.

**State persistence** (`state.js`):
- localStorage key: `parla-state`
- Only `activeCountry`, `activeCategory` and `mode` are persisted. Query, diagram and open-expression state are ephemeral.
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

---

## Expressions mode

The second half of the app, reached by the `Palabras` / `Expresiones` switch in the sheet head. Data lives in **`api/v1/expressions.json`**, deliberately not in the dictionary: the two have opposite shapes.

- A dictionary **concept** is one meaning wearing eight different words. An **expression** is one phrase belonging to one country, whose surface reading tells you nothing about what it means.
- That gap is the entire point, so `literal` and `meaning` are both required. `make coverage` fails on an entry missing either, on an unknown country code, and on a duplicate id.

```json
{ "version": "1.0.0",
  "expressions": [
    { "id": "el-que-toca-mano-toca-cara", "phrase": "el que toca mano toca cara", "country": "CO",
      "literal": "quien alcanza a tocarte la mano, alcanza a tocarte la cara",
      "meaning": "anda buscando pelea: está midiendo hasta dónde puede llegar contigo" }
  ] }
```

- 71 entries, 8 to 9 per country. US entries are calques (`vacunar la carpeta`, `hacer sentido`), which is the honest Spanglish story and matches how the dictionary already treats US.
- `expressions.js` scans all 71 rows per keystroke rather than building an inverted index. Most people arrive from the *meaning*, not the phrase, and an index over 71 rows buys nothing measurable.
- **Cards are closed until asked.** The phrase is the question and the reading plus the meaning are the answer; printing all three at once on 71 cards gives the reader no reason to look. One card is open at a time, and opening one sends the camera to its country **without** touching the country filter, so the list does not vanish underneath you.
- The collapse uses the `0fr`/`1fr` grid trick, which needs **exactly one child** (`.expr-reveal-inner`). A second child lands in an implicit `auto` row and every closed card keeps its full height. Only `opacity` is transitioned: Firefox does not interpolate `fr` track sizes.
- The globe's hover tip (`overlay.js#showCountryCard`) reads `state.mode` and previews expressions instead of dictionary terms while the mode is on.
- Switching modes clears the open concept and expression, and keeps the query, which is re-run against the other data set.

---

**Word of the day** is deterministically seeded by `YYYY * 10000 + MM * 100 + DD` modulo concept count, so it's stable for the entire day without any server.

---

## Usage examples

One short sentence per variant, showing the word in a situation rather than defining it. Data lives in **`api/v1/usage.json`**, keyed `"<concept id>|<lowercased term>"`.

- **Deliberately not in `dictionary.json`.** That file gates the first render and the search index; examples are only needed once a word is open. `loadUsage()` is fired from `app.js` after `initStage`, not awaited, and never blocks anything.
- If it lands while a concept is already open, it dispatches `parla:usage-ready` and `app.js` redraws that concept. Without it, a word opened during the fetch would keep an empty example for as long as it stayed open.
- A missing or failed `usage.json` is not fatal: `usageFor()` returns null and every surface treats that as "no example", so no marker and no popover.
- **The hero card shows its example inline** (`.center-usage`). It is the word the visitor asked about and there is room on that card.
- **Nodes get a marker, not a button.** `.diagram-node` is already a `<button>`, and a nested button is invalid markup, so `.node-info` is an inert glyph and the node itself is the trigger: hover on pointer devices, `focusin` for keyboard, tap on touch. The example is also appended to the node's `aria-label`, so the popover is an enhancement rather than the only route to it.
- `#usagePop` is `position: fixed` with `pointer-events: none`, placed above the node when there is room and below when there is not, then clamped to the viewport. It hides on `parla:concept`, scroll and resize, because a camera move invalidates its anchor.
- `make coverage` fails on a key matching no concept/variant pair, an empty example, and an example that never uses its own word (matched on a 4-character accent-free prefix so conjugation and agreement still count).

---

**Search normalization** strips diacritics via `NFD` decomposition and removes non-alphanumeric characters, so searching "bacan" matches "bacán".

**Deep links:** `#w=<concept-id>` in the URL opens that concept's diagram on load. `openFromHash()` runs on init and on `hashchange`.

**Variant merging in `showDiagram()`:** before laying out nodes, variants with the same term (case-insensitive) are merged. Their `countries` arrays are unioned and the first `note` wins. The matched term is placed in the center; all other grouped variants become outer nodes.

**Browse section:** `renderBrowse()` groups concepts by category. Each section shows the first 3 cards; the rest have class `hidden`. A "Ver N más" button per section toggles `.hidden` on the remaining cards via `events.js`.

**Keyboard shortcuts:** `/` focuses the search input; `Escape` closes the diagram (or clears search if no diagram is open).

---

## Testing

Two layers, because the failures came in two kinds and neither layer can see the other's.

**`make check`** runs every `tests/*.test.mjs` under `node --test`: the camera-fit suite and the hover-preview suite. It covers `js/camerafit.js`, which exists precisely so the camera arithmetic can be tested without a WebGL context: no three, no DOM, no dependencies, no `package.json`. It also reads the real `data/americas.json` and `api/v1/dictionary.json`, so **adding a country or moving an anchor is checked against the same numbers the globe uses**. Two assertions carry the camera fit, and it takes both. That a fitted cap never subtends more than the band the dock leaves is one-sided, and both of its terms come from `fitDistance`, so it reduces to `min(vertical, horizontal) <= vertical` and cannot fail whatever `fitDistance` does: it catches over-fitting and is blind to under-fitting. The second asserts the cap *fills* the binding axis, measured against `visibleHalfAngle`, which does not go through `fitDistance` and is therefore an independent number. Squaring `visible` inside `fitDistance` draws the globe at a fraction of the band, passes the first and fails the second. A third test keeps the pre-fix formula around and asserts it *fails* the one-sided check, so that one cannot quietly stop meaning anything either.

**`make check-stage`** opens `tests/stage.html` against the dev server. It boots the app in sized iframes (desktop, short laptop, portrait phone, a returning visitor with a saved filter, sheet open, the country hover tip, `?nogl=1`) and asserts what actually rendered: the search bar is on screen and opaque, `--dock-height` matches the dock, the reset control is not offering to reset an untouched view, a saved filter is still escapable, the country panel names the country the list below it is showing, and the hover tip is click-through and sits in the band between the header and the dock. It exports no test hook from the app and reads only what a visitor can see, so it cannot pass by agreeing with a wrong implementation. 53 checks when every case runs, 7 of them in the hover case; every line must be green.

**The hover-tip case needs a foreground tab and says so.** The globe resolves hovers inside its render loop, and a browser that has the page backgrounded stops `requestAnimationFrame`, so the tip can never appear however correct the code is. The case proves rAF is dead before reaching for `check.skip`, which prints an amber SKIPPED line with the reason and turns the summary amber rather than green. A skip is never used for a check that could have failed: with frames running, no tip is a failure.

Both suites were verified by reverting each fix and confirming the relevant checks go red. A guard nobody has seen fail is not a guard.

## Key gotchas

- `$(id)` in `utils.js` caches element references by ID: do not call it before the DOM is ready, and avoid re-using IDs across dynamic re-renders.
- The diagram center element is re-rendered on every `showDiagram()` call, which inserts the Back/Share buttons. Event handlers for those buttons are delegated on `#diagramArea`, not attached to the buttons directly.
- `relayout()` in `render.js` is called on window resize: it only works if `s.activeConcept` is set and `#diagramArea` is visible.
- To add a new category, add entries to `CATEGORY_LABELS` and `CATEGORY_ICONS` in `utils.js` in addition to the dictionary data. Categories are a dictionary-only concept: `body.mode-expressions` hides `#categorySelect`.
- The word-of-day dialog is fired **before** `initStage()`, since it needs only the dictionary. It used to wait for the stage and appeared a beat after the page had settled.
- **To add a new country: add one entry to `api/v1/dictionary.json` under `countries` (with its `anchor` lon/lat), then run `make geometry`.** That is the whole procedure. The anchor is the single source of truth that `render.js`, the globe and the geometry build all read; it used to be duplicated in three places.
- `make coverage` validates every country code in the data and **exits non-zero on an unknown one**. This is the guard for the `_CL` class of typo, which rendered as literal text where a flag belonged and made the variant invisible to the CL filter.
- `scripts/build_geometry.py` re-downloads Natural Earth 1:50m. Its Douglas-Peucker has a zero-length-baseline guard: GeoJSON rings are closed, so `pts[0] == pts[-1]` and without the guard **every ring silently collapses to two points**. The script asserts a point-count floor to catch it.
- Categories now include `daily` ("Cotidiano"), 18 concepts that carry a term for **all eight** countries. Opening one lights up the whole globe, which is the clearest demo of the map. The original ten were the Spanglish set (`to-park`, `la troca`, `la marketa`); the eight added on 2026-09-01 are the everyday objects and drinks the region disagrees about most (`trash-can`, `popcorn`, `drinking-straw`, `t-shirt`, `flip-flops`, `beer`, `coffee`, `bus`), which is where `la caneca` lives. Some of those terms deliberately collide with another concept, and each carries a `note` pointing at the other reading: `la camioneta` is a bus in Venezuela and a pickup across most of the region, Venezuela included, so that one term answers to both concepts there, `el guayoyo` is weak black coffee in Venezuela and already an insult under `watered-down`, and `el basurero` is the kitchen bin in Chile and the municipal dump in Colombia.
- **`resize()` in `globe3d.js` takes an optional `wasHome`, so its ResizeObserver must be wrapped**: `new ResizeObserver(resize)` hands the callback `(entries, observer)`, and `entries` is a truthy array that would land in `wasHome` and force `goHome(false)` on every container resize. It is `() => resize()`.
- **`setBottomInset()` reads `isHomeView()` before it mutates `bottomInset`.** `homeDistance()` is fitted to the visible band, so asking afterwards compares the camera against a home it has not been sent to yet: the answer is always no, the refit never runs, and the camera is stranded at a distance fitted for a stage the dock was not covering. The visible symptom is `isHomeView()` false on the opening view, and the reset control offering to reset a view nobody moved.
- **The command bar is deliberately solid on the stage and glass in the fallback.** `rgba(4,7,20,.55)` composites to rgb(7,12,28) over an ocean of rgb(11,18,38), inside a `.07` hairline: on the globe the whole control is within a few levels of what is behind it and reads as missing. On the page background of the fallback the same glass is legible, so only `body.globe-mode .command-bar` is overridden. `tests/stage.html` asserts both alpha values.
