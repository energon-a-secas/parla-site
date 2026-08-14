// -- Globe overlay --
// Pins the term cards render.js built onto the countries they belong to.
//
// The cards are the same DOM the radial diagram uses. Only their positions
// come from somewhere else now: each card sits at the screen centroid of its
// countries, with a leader line back to each one. Once a card has been pushed
// off its anchor to avoid an overlap, that leader is the only thing left
// carrying the term-to-country mapping, so it is not decoration.

import { separate } from './collide.js';
import { sampleTerms } from './data.js';
import { $, escHtml } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RIM_FACTOR = 1.06;   // how far outside the silhouette a far-side card parks
const REFRAME_LIMIT = 3;   // more rim-pinned cards than this and we refit the camera

export function createOverlay({ globe, dictionary }) {
  const area = $('diagramArea');
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
  }

  /**
   * Hovering a country lights the cards that mention it and shows a sample of
   * its slang. This is the 2D globe's capital-pin card, moved onto real
   * geometry: you now hover the country itself, not a dot beside it.
   */
  function hoverCountry(code) {
    for (const card of cards) {
      card.el.classList.toggle('is-linked', !!code && card.countries.includes(code));
    }
    showCountryCard(code);
  }

  function showCountryCard(code) {
    if (!cardEl) return;
    const meta = code && dictionary.countries[code];
    const samples = meta ? sampleTerms(dictionary, code, 5) : [];
    if (!meta || !samples.length) {
      cardEl.classList.add('hidden');
      return;
    }

    const variety = meta.variety ? ` <span class="globe-card-variety">${escHtml(meta.variety)}</span>` : '';
    cardEl.innerHTML = `
      <div class="globe-card-head">${meta.flag} ${escHtml(meta.name)}${variety}</div>
      <ul class="globe-card-terms">${samples.map((s2) =>
        `<li><span class="globe-card-term">${escHtml(s2.term)}</span>` +
        `<span class="globe-card-meaning">${escHtml(s2.meaning)}</span></li>`).join('')}
    </ul>`;
    cardEl.classList.remove('hidden');

    const p = globe.projectCountry(code);
    const host = area.getBoundingClientRect();
    requestAnimationFrame(() => {
      const rect = cardEl.getBoundingClientRect();
      const pad = 12;
      let left = (p ? host.left + p.x : host.left + host.width / 2) + 18;
      let top = (p ? host.top + p.y : host.top + host.height / 2) - rect.height / 2;
      left = Math.max(pad, Math.min(left, window.innerWidth - rect.width - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - rect.height - pad));
      cardEl.style.left = `${left}px`;
      cardEl.style.top = `${top}px`;
    });
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
    cardEl?.classList.add('hidden');
    live = false;
    reframed = false;
    cards = [];
    conceptCodes = [];
    if (linesSvg) linesSvg.innerHTML = '';
  }

  /** Project every card onto its countries. Runs on dirty frames only. */
  function update() {
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
    resolve(screen);
    place(screen);
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
