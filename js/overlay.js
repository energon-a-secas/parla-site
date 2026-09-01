// -- Globe overlay --
// Pins the term cards render.js built onto the countries they belong to.
//
// The cards are the same DOM the radial diagram uses. Only their positions
// come from somewhere else now: each card sits at the screen centroid of its
// countries, with a leader line back to each one. Once a card has been pushed
// off its anchor to avoid an overlap, that leader is the only thing left
// carrying the term-to-country mapping, so it is not decoration.

import { separate } from './collide.js';
import { previewTerms } from './data.js';
import { sampleExpressions } from './expressions.js';
import { state } from './state.js';
import { $, escHtml } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RIM_FACTOR = 1.06;   // how far outside the silhouette a far-side card parks
const REFRAME_LIMIT = 3;   // more rim-pinned cards than this and we refit the camera

export function createOverlay({ globe, dictionary }) {
  const area = $('diagramArea');
  // The globe projects into ITS OWN box, so screen coordinates have to be
  // offset by the stage, not by the card layer. They are the same rectangle
  // only while a concept is open: #diagramArea is display:none in every other
  // state, and a display:none element measures {0,0,0,0}, which silently
  // subtracted the header's height from every hover tip on the opening view.
  const stageEl = $('globeStage');
  const nodesWrap = $('diagramNodes');
  const linesSvg = $('diagramLines');
  const centerEl = $('diagramCenter');
  const cardEl = $('globeCard');

  let cards = [];            // { el, countries, w, h, x, y, rim }
  let conceptCodes = [];
  let activeCountry = null;
  let live = false;
  let reframed = false;
  let heroBox = null;
  let safe = null;
  let tipCode = null;        // the country the hover tip is currently showing
  let tipSize = null;        // measured once per show; the tip is repositioned every frame

  /**
   * The band a card may occupy. The dock covers the foot of the stage, so a
   * card placed there would simply be invisible; cards get pushed above it and
   * keep their leader line back to the country.
   */
  function measureBounds(screen) {
    const dock = document.querySelector('.dock');
    const areaRect = area.getBoundingClientRect();
    let bottom = screen.height;
    if (dock) {
      const d = dock.getBoundingClientRect();
      if (d.height) bottom = Math.max(screen.height * 0.5, d.top - areaRect.top - 8);
    }
    safe = { width: screen.width, height: bottom };
    return safe;
  }

  function safeBounds(screen) {
    return safe && safe.width === screen.width ? safe : measureBounds(screen);
  }

  function hasConcept() {
    return live;
  }

  function setActiveCountry(code) {
    activeCountry = code || null;
    // The tip's suppression rule reads state.activeCountry, so drop a tip that
    // the filter has just taken over. focusCountry() without a filter change
    // leaves it up, which is the point.
    if (tipCode && tipCode === state.activeCountry) hideCountryCard();
  }

  /**
   * Hovering a country lights the cards that mention it and shows a taste of
   * its slang. This is the 2D globe's capital-pin card, moved onto real
   * geometry: you now hover the country itself, not a dot beside it.
   */
  function hoverCountry(code) {
    for (const card of cards) {
      card.el.classList.toggle('is-linked', !!code && card.countries.includes(code));
    }
    showCountryCard(code);
  }

  /**
   * The hover tip: which country is this, and three of its words.
   *
   * It is a tip, not a panel. The panel is the sheet, which the click opens on
   * the country in full, and this deliberately says less than it does. The
   * version that tried to be both was 280x295px of `pointer-events: auto`
   * placed on top of the pointer that summoned it, so it took the pointer,
   * the canvas fired `pointerleave`, the overlay hid it, and the pointer was
   * back over the canvas. Every re-show drew a fresh random five, so the
   * visible result was a flash of different words on every twitch of the
   * mouse.
   */
  function showCountryCard(code) {
    if (!cardEl) return;
    // Nothing to add about the country whose panel is already open. This is
    // also the state the flicker was reported from: a selected country fills
    // the zoomed stage, so its tip lands under the pointer more often than not.
    //
    // Keyed on the FILTER, not on the overlay's focused country. Opening an
    // expression, or a term card, calls focusCountry() without filtering, so
    // keying on that left one country silently tipless with no panel and no
    // highlight to explain why it was the odd one out.
    const suppressed = code && code === state.activeCountry;
    const meta = code && !suppressed && dictionary.countries[code];
    // The tip previews whatever the current mode is about, so hovering a
    // country in Expresiones does not advertise the dictionary the visitor
    // just switched away from.
    const expressive = state.mode === 'expressions';
    const rows = !meta ? []
      : expressive
        ? sampleExpressions(state.expressions, code, 3)
            .map((e) => ({ term: e.phrase, meaning: e.meaning }))
        : previewTerms(dictionary, code, 3);
    if (!meta || !rows.length) {
      hideCountryCard();
      return;
    }

    const variety = meta.variety ? ` <span class="globe-card-variety">${escHtml(meta.variety)}</span>` : '';
    cardEl.innerHTML = `
      <div class="globe-card-head">${meta.flag} ${escHtml(meta.name)}${variety}</div>
      <ul class="globe-card-terms${expressive ? ' globe-card-terms--stacked' : ''}">${rows.map((s2) =>
        `<li><span class="globe-card-term">${escHtml(s2.term)}</span>` +
        `<span class="globe-card-meaning">${escHtml(s2.meaning)}</span></li>`).join('')}
    </ul>
    <p class="globe-card-hint">Toca para ver ${escHtml(meta.name)}</p>`;
    cardEl.classList.remove('hidden');
    tipCode = code;
    // Measured once per show, synchronously, and placed before the browser can
    // paint. Measuring in a requestAnimationFrame instead published the tip at
    // the PREVIOUS country's coordinates for one frame, and at the viewport
    // corner on the first hover of a session, because the class was removed a
    // frame before the position was written. The forced reflow costs one
    // layout per hover change, not per frame: positionCountryCard() runs on
    // every drawn frame and deliberately reads nothing.
    const rect = cardEl.getBoundingClientRect();
    tipSize = { w: rect.width, h: rect.height };
    positionCountryCard();
  }

  function hideCountryCard() {
    tipCode = null;
    tipSize = null;
    cardEl?.classList.add('hidden');
  }

  /**
   * Keep the tip on its country while the camera moves.
   *
   * It used to be placed once on show and never again, so it was stale from
   * the first frame of the tween that focusCountry() starts. Clamped into the
   * band between the header and the dock, because the tip is z-index 2 under a
   * sticky header: a tall one clamped to the viewport top slid under the header
   * and lost the country name it exists to give.
   */
  function positionCountryCard() {
    if (!tipCode || !tipSize || !cardEl) return;
    const p = globe.projectCountry(tipCode);
    const host = (stageEl || area).getBoundingClientRect();
    const pad = 12;
    const header = document.querySelector('.header-bar');
    const dock = document.querySelector('.dock');
    const top0 = header ? Math.max(pad, header.getBoundingClientRect().bottom + pad) : pad;
    const dockTop = dock ? dock.getBoundingClientRect().top : window.innerHeight;
    const bottom0 = Math.min(window.innerHeight, dockTop) - pad;

    let left = (p ? host.left + p.x : host.left + host.width / 2) + 18;
    let top = (p ? host.top + p.y : host.top + host.height / 2) - tipSize.h / 2;
    // Flip to the other side of the country rather than sliding off the edge.
    if (left + tipSize.w > window.innerWidth - pad) {
      left = (p ? host.left + p.x : host.left + host.width / 2) - 18 - tipSize.w;
    }
    left = Math.max(pad, Math.min(left, window.innerWidth - tipSize.w - pad));
    top = Math.max(top0, Math.min(top, Math.max(top0, bottom0 - tipSize.h)));
    cardEl.style.left = `${Math.round(left)}px`;
    cardEl.style.top = `${Math.round(top)}px`;
  }

  /**
   * Take over the cards render.js just built.
   * Sizes are measured exactly once here: re-measuring offsetWidth every frame
   * would force a reflow 60 times a second.
   */
  function attach(concept, matchedVariant, groupedVariants, state) {
    const els = [...nodesWrap.querySelectorAll('.diagram-node')];
    const codes = new Set();
    for (const v of concept.variants) for (const c of v.countries) codes.add(c);
    conceptCodes = [...codes].filter((c) => globe.hasCountry(c));
    activeCountry = state.activeCountry || null;

    cards = els.map((el) => {
      const countries = (el.dataset.countries || '')
        .split(',')
        .filter((c) => c && globe.hasCountry(c));
      return {
        el,
        countries,
        w: el.offsetWidth,
        h: el.offsetHeight,
        x: 0, y: 0, rim: false,
      };
    });

    live = true;
    reframed = false;
    safe = null;
    area.classList.remove('hidden');

    measureHero();
    globe.setSelection({ country: activeCountry, countries: conceptCodes });
    globe.frameCountries(conceptCodes, { weight: activeCountry });
    update();
    settle();
  }

  function clear() {
    hideCountryCard();
    live = false;
    reframed = false;
    cards = [];
    conceptCodes = [];
    if (linesSvg) linesSvg.innerHTML = '';
  }

  /** Project every card onto its countries. Runs on dirty frames only. */
  function update() {
    positionCountryCard();
    if (!live || !cards.length) return;
    const screen = globe.globeScreen();
    if (!screen) return;

    let rimCount = 0;

    for (const card of cards) {
      const points = card.countries
        .map((c) => {
          const p = globe.projectCountry(c);
          if (!p) return null;
          p.color = dictionary.countries[c]?.color || 'currentColor';
          return p;
        })
        .filter(Boolean);

      const front = points.filter((p) => p.front);
      card.anchors = points;

      if (front.length) {
        card.rim = false;
        card.x = front.reduce((s, p) => s + p.x, 0) / front.length;
        card.y = front.reduce((s, p) => s + p.y, 0) / front.length;
      } else if (points.length) {
        // Far side. Park it on the rim in the right direction rather than
        // hiding it: a term vanishing would break the cross-country story
        // that is the whole point of the map.
        card.rim = true;
        rimCount++;
        const avg = points.reduce(
          (s, p) => ({ x: s.x + p.x - screen.cx, y: s.y + p.y - screen.cy }),
          { x: 0, y: 0 },
        );
        const len = Math.hypot(avg.x, avg.y) || 1;
        card.x = screen.cx + (avg.x / len) * screen.radius * RIM_FACTOR;
        card.y = screen.cy + (avg.y / len) * screen.radius * RIM_FACTOR;
      } else {
        card.rim = true;
        rimCount++;
        card.x = screen.cx;
        card.y = screen.cy;
      }

      card.el.classList.toggle('diagram-node--rim', card.rim);
    }

    // Resolve overlaps on every positioning pass, not only when the globe
    // comes to rest. Sizes are cached, so the solver is pure arithmetic and
    // cheap; making it order-independent is worth far more than the few
    // microseconds saved by trying to run it only on settle.
    resolve(screen);
    place(screen);

    if (rimCount > REFRAME_LIMIT && !reframed) {
      // Too much of the concept is behind the globe to read. Pull back so the
      // whole set is visible instead of leaving a pile of cards on the rim.
      // Once only: this runs from onFrame, and refitting starts a tween that
      // would dirty the next frame and refit again forever.
      reframed = true;
      globe.frameCountries(conceptCodes, { weight: activeCountry });
    }
  }

  /**
   * Measure the hero card once. It is pinned to the corner and never moves,
   * so reading its rect every frame would force a reflow 60 times a second
   * for a number that cannot change.
   */
  function measureHero() {
    heroBox = null;
    if (!centerEl || centerEl.classList.contains('hidden')) return;
    const areaRect = area.getBoundingClientRect();
    const rect = centerEl.getBoundingClientRect();
    if (!rect.width) return;
    heroBox = {
      x: rect.left - areaRect.left + rect.width / 2,
      y: rect.top - areaRect.top + rect.height / 2,
      w: rect.width,
      h: rect.height,
    };
  }

  /** Push cards apart, and out from under the hero card and the dock. */
  function resolve(screen) {
    separate(cards, safeBounds(screen), { gap: 12, pinned: heroBox ? [heroBox] : [] });
  }

  /** Final polish once the globe stops moving. */
  function settle() {
    if (!live || !cards.length) return;
    const screen = globe.globeScreen();
    if (!screen) return;
    safe = null;          // the dock may have opened or closed since
    measureHero();
    // update(), not resolve()+place(). The safe band is first measured a frame
    // into the sheet's 200ms collapse, so cards get squeezed into a band sized
    // for an open dock; re-separating them inside that stale band only pushes
    // them apart again, it never puts them back over their countries. update()
    // re-projects first. Its one-shot `reframed` latch means the refit inside
    // it cannot loop when reached from here.
    update();
  }

  /** Write positions and redraw the leaders. */
  function place(screen) {
    for (const card of cards) {
      // The independent `translate` property composes with the stylesheet's
      // transform, so the centring and the hover scale keep working while the
      // position stays a compositor-only write.
      card.el.style.translate = `${Math.round(card.x)}px ${Math.round(card.y)}px`;
    }
    drawLeaders(screen);
  }

  function drawLeaders(screen) {
    if (!linesSvg) return;
    linesSvg.setAttribute('viewBox', `0 0 ${screen.width} ${screen.height}`);
    const paths = [];

    for (const card of cards) {
      for (const p of card.anchors || []) {
        if (!p.front && !card.rim) continue;
        const dx = p.x - card.x;
        const dy = p.y - card.y;
        const len = Math.hypot(dx, dy);
        if (len < 12) continue;   // card is sitting on its country already
        const cpx = (card.x + p.x) / 2 + (-dy / len) * Math.min(25, len * 0.18);
        const cpy = (card.y + p.y) / 2 + (dx / len) * Math.min(25, len * 0.18);
        paths.push(
          `<path d="M${card.x.toFixed(1)},${card.y.toFixed(1)} Q${cpx.toFixed(1)},${cpy.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}"` +
          ` stroke="${p.color || 'currentColor'}" stroke-width="1.5" stroke-opacity="${p.front ? 0.25 : 0.12}"` +
          ` stroke-dasharray="6 4" fill="none" class="diagram-line"/>`,
        );
      }
    }
    linesSvg.innerHTML = paths.join('');
  }

  return { attach, update, settle, clear, hasConcept, setActiveCountry, hoverCountry };
}
