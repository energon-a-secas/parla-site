// -- DOM rendering --
// All functions that create or update DOM elements.

import { state, isWodDismissedToday, dismissWodToday } from './state.js';
import { getCountries, getCategories, browseConcepts } from './data.js';
import { browseExpressions, groupByCountry } from './expressions.js';
import { showConcept } from './diagram.js';
import { separate } from './collide.js';
import { $, escHtml, categoryLabel, categoryIcon } from './utils.js';

export function render(s) {
  renderCountryFilters(s);
  renderCategoryFilters(s);
  renderBrowse(s);
}

const PROMPTS = [
  'Usa esta palabra hoy en una conversación:',
  'Sorprende a alguien con esta palabra:',
  'Impresiona a tus amigos con:',
  'Hoy te toca aprender:',
  'Desafía a alguien a usar esta palabra:',
  'Mete esta en tu próximo chat:',
  'Palabra del día, úsalas o piérdelas:',
];

export function getWordOfDayData(s) {
  if (!s.dictionary?.concepts?.length) return null;
  const countries = getCountries(s.dictionary);
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const concepts = s.dictionary.concepts;
  const concept = concepts[seed % concepts.length];
  const variant = concept.variants[seed % concept.variants.length];
  const promptIdx = seed % PROMPTS.length;
  return { concept, variant, prompt: PROMPTS[promptIdx], countries };
}

export function renderWordOfDayContent(s) {
  const data = getWordOfDayData(s);
  const content = $('wodContent');
  if (!data || !content) return null;

  const { concept, variant, prompt, countries } = data;
  const flags = variant.countries.map(c => countries[c]?.flag || c).join(' ');

  content.innerHTML = `
    <p class="wod-prompt">${prompt}</p>
    <button type="button" class="wod-term-btn" id="wodOpen">
      <span class="wod-term">${escHtml(variant.term)}</span>
      <span class="wod-flag">${flags}</span>
    </button>
    <p class="wod-meaning">${escHtml(concept.meaning_en)}</p>
  `;

  return { concept, variant };
}

export function showWordOfDayDialog(s) {
  const dialog = $('wodDialog');
  if (!dialog || isWodDismissedToday()) return;

  const payload = renderWordOfDayContent(s);
  if (!payload) return;

  if (typeof dialog.showModal === 'function' && !dialog.open) {
    dialog.showModal();
  } else {
    dialog.classList.add('open');
  }
}

export function hideWordOfDayDialog() {
  const dialog = $('wodDialog');
  if (!dialog) return;
  if (dialog.open) dialog.close();
  dialog.classList.remove('open');
}

export function dismissWordOfDayForToday() {
  dismissWodToday();
  hideWordOfDayDialog();
}

export function renderIntro(s) {
  const examples = $('introExamples');
  if (!examples || !s.dictionary) return;
  const sample = [
    'bacán', 'chido', 'pega', 'flaite', 'weón', 'cool', 'party',
    'chévere', 'laburo', 'naco', 'boludo', 'pana',
  ];
  const shuffled = sample.sort(() => Math.random() - 0.5).slice(0, 8);
  examples.innerHTML = shuffled.map(w =>
    `<button class="example-pill" data-word="${escHtml(w)}">${escHtml(w)}</button>`
  ).join('');
}

export function renderCountryFilters(s) {
  const el = $('countrySelect');
  if (!el || !s.dictionary) return;
  const countries = getCountries(s.dictionary);
  const codes = Object.keys(countries);
  el.innerHTML = `<option value="">Todos los países</option>` +
    codes.map(code => {
      const c = countries[code];
      const sel = s.activeCountry === code ? ' selected' : '';
      return `<option value="${code}"${sel}>${c.flag} ${c.name}</option>`;
    }).join('');
}

export function renderCategoryFilters(s) {
  const el = $('categorySelect');
  if (!el || !s.dictionary) return;
  const cats = getCategories(s.dictionary);
  el.innerHTML = `<option value="">Todas las categorías</option>` +
    cats.map(cat => {
      const sel = s.activeCategory === cat ? ' selected' : '';
      return `<option value="${cat}"${sel}>${categoryIcon(cat)} ${categoryLabel(cat)}</option>`;
    }).join('');
}

/**
 * @param {boolean} [autoOpen=true] A lone result normally opens straight into
 * the diagram. Closing the diagram must not do that, or Back re-opens the very
 * thing it just closed and the button looks dead.
 */
export function renderResults(results, s, autoOpen = true) {
  const area = $('resultsArea');
  const intro = $('introState');
  const diagram = $('diagramArea');
  const browse = $('browseArea');

  if (!results.length) {
    intro.classList.add('hidden');
    diagram.classList.add('hidden');
    browse.classList.add('hidden');
    area.innerHTML = '<div class="no-results">No se encontraron resultados. Prueba otra palabra.</div>';
    return;
  }

  area.innerHTML = '';
  intro.classList.add('hidden');
  browse.classList.add('hidden');

  if (results.length === 1 && autoOpen) {
    showDiagram(results[0].concept, results[0].matchedVariant, s);
    return;
  }

  diagram.classList.add('hidden');
  area.innerHTML = results.map(r => renderResultCard(r, s)).join('');
}

function renderResultCard(result, s) {
  const { concept, matchedVariant } = result;
  const countries = getCountries(s.dictionary);
  if (s.activeCountry) {
    const cv = concept.variants.find(v => v.countries.includes(s.activeCountry));
    const heroTerm = cv ? cv.term : matchedVariant.term;
    const heroFlag = countries[s.activeCountry]?.flag || '';
    return `<button class="result-card" data-concept="${escHtml(concept.id)}" data-term="${escHtml(heroTerm)}">
      <div class="result-body">
        <div class="result-term">${escHtml(heroTerm)} <span class="result-flags">${heroFlag}</span></div>
        <div class="result-meaning">${escHtml(concept.meaning_en)}</div>
        <div class="result-category">${categoryIcon(concept.category)} ${categoryLabel(concept.category)}</div>
      </div>
      <span class="result-arrow">\u2192</span>
    </button>`;
  }
  const flags = matchedVariant.countries.map(c => countries[c]?.flag || c).join(' ');
  return `<button class="result-card" data-concept="${escHtml(concept.id)}" data-term="${escHtml(matchedVariant.term)}">
    <div class="result-body">
      <div class="result-term">${escHtml(concept.meaning_en)}</div>
      <div class="result-meaning">${escHtml(matchedVariant.term)} <span class="result-flags">${flags}</span></div>
      <div class="result-category">${categoryIcon(concept.category)} ${categoryLabel(concept.category)}</div>
    </div>
    <span class="result-arrow">\u2192</span>
  </button>`;
}

export function showDiagram(concept, matchedVariant, s) {
  const diagram = $('diagramArea');
  const center = $('diagramCenter');
  const nodes = $('diagramNodes');
  const lines = $('diagramLines');
  const area = $('resultsArea');
  const browse = $('browseArea');
  const countries = getCountries(s.dictionary);

  area.innerHTML = '';
  browse.classList.add('hidden');
  diagram.classList.remove('hidden');
  if (document.body.classList.contains('no-webgl')) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, left: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }

  s.activeConcept = concept;
  s.matchedTerm = matchedVariant?.term || concept.variants[0].term;

  if (s.activeCountry) {
    const cv = concept.variants.find(v => v.countries.includes(s.activeCountry));
    const heroTerm = cv ? cv.term : s.matchedTerm;
    const heroFlag = countries[s.activeCountry]?.flag || '';
    s.matchedTerm = heroTerm;
    center.innerHTML = `
      <div class="center-term">${escHtml(heroTerm)} <span class="center-flag">${heroFlag}</span></div>
      <div class="center-meaning">${escHtml(concept.meaning_en)}</div>
      <div class="center-category">${categoryIcon(concept.category)} ${categoryLabel(concept.category)}</div>
    `;
  } else {
    const heroFlags = (matchedVariant?.countries || concept.variants[0].countries)
      .map(c => countries[c]?.flag || '').join(' ');
    center.innerHTML = `
      <div class="center-term">${escHtml(s.matchedTerm)} <span class="center-flag">${heroFlags}</span></div>
      <div class="center-meaning">${escHtml(concept.meaning_en)}</div>
      <div class="center-category">${categoryIcon(concept.category)} ${categoryLabel(concept.category)}</div>
    `;
  }

  center.insertAdjacentHTML('beforeend', `
    <div class="diagram-controls">
      <button class="diagram-back" id="diagramBack" aria-label="Back to search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>
        Back
      </button>
      <button class="diagram-share" id="diagramShare" aria-label="Share this word">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Share
      </button>
    </div>
  `);

  const newHash = '#w=' + encodeURIComponent(concept.id);
  if (window.location.hash === newHash) {
    history.replaceState(null, '', newHash);
    s.diagramPushedState = false;
  } else {
    history.pushState(null, '', newHash);
    s.diagramPushedState = true;
  }

  // Group variants: merge those with same term
  const grouped = [];
  const termMap = new Map();
  for (const v of concept.variants) {
    const key = v.term.toLowerCase();
    if (termMap.has(key)) {
      const existing = termMap.get(key);
      existing.countries = [...new Set([...existing.countries, ...v.countries])];
      if (v.note && !existing.note) existing.note = v.note;
    } else {
      const entry = { term: v.term, countries: [...v.countries], note: v.note };
      termMap.set(key, entry);
      grouped.push(entry);
    }
  }

  // Filter out the matched term from outer nodes (it's in the center)
  const outerNodes = grouped.filter(v => v.term.toLowerCase() !== s.matchedTerm?.toLowerCase());

  // If the matched term was the only variant, show all variants instead
  const displayNodes = outerNodes.length > 0 ? outerNodes : grouped;
  const count = displayNodes.length;

  nodes.innerHTML = displayNodes.map((v, i) => {
    const flags = v.countries.map(c => countries[c]?.flag || c).join(' ');
    const colorList = v.countries.map(c => countries[c]?.color || '#888');
    const borderColor = colorList[0];
    const isMatch = v.term.toLowerCase() === s.matchedTerm?.toLowerCase();
    const note = v.note ? `<div class="node-note">${escHtml(v.note)}</div>` : '';
    const countryNames = v.countries.map(c => countries[c]?.name || c).join(', ');
    return `<button type="button" class="diagram-node ${isMatch ? 'matched' : ''}" data-index="${i}" data-countries="${v.countries.join(',')}" style="--node-color:${borderColor}" aria-label="${escHtml(v.term)}, ${escHtml(countryNames)}">
      <div class="node-flags">${flags}</div>
      <div class="node-term">${escHtml(v.term)}</div>
      <div class="node-countries">${escHtml(countryNames)}</div>
      ${note}
    </button>`;
  }).join('');

  announceConcept(concept, displayNodes, countries);
  window.dispatchEvent(new CustomEvent('parla:concept', { detail: concept.id }));

  requestAnimationFrame(() => {
    if (showConcept(concept, matchedVariant, displayNodes, s)) return;
    // Fallback only: no WebGL, so lay the same cards out radially.
    sizeDiagram(diagram);
    layoutDiagram(diagram, center, nodes, lines, count);
  });
}

const DIAGRAM_GEO_CENTER = { lon: -72, lat: -8 };

function countryDiagramAngle(code) {
  const cap = state.dictionary?.countries?.[code]?.anchor;
  if (!cap) return null;
  const { lon: refLon, lat: refLat } = DIAGRAM_GEO_CENTER;
  return Math.atan2(-(cap.lat - refLat), cap.lon - refLon);
}

function buildCountryAngles(countryCodes) {
  const angles = {};
  const unknown = [];
  for (const code of countryCodes) {
    const geo = countryDiagramAngle(code);
    if (geo !== null) angles[code] = geo;
    else unknown.push(code);
  }
  const sectorSize = (2 * Math.PI) / Math.max(unknown.length, 1);
  unknown.sort().forEach((code, i) => {
    angles[code] = sectorSize * i - Math.PI / 2;
  });
  return angles;
}

function sizeDiagram(container) {
  const headerH = 68;
  const diagramTop = container.getBoundingClientRect().top + window.scrollY;
  const available = window.innerHeight - (diagramTop - window.scrollY);
  const h = Math.max(available - 16, 400);
  container.style.height = h + 'px';
}

function layoutDiagram(container, center, nodesWrap, linesSvg, count) {
  const rect = container.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;

  const nodeEls = nodesWrap.querySelectorAll('.diagram-node');
  if (!nodeEls.length) return;

  const isMobile = window.innerWidth < 600;
  const isSmall = window.innerWidth < 400;

  // Proximity-based layout: nodes sharing countries cluster together.
  // Country angles follow hub capital positions (north up, MX northwest, BR east).
  const allCountries = [];
  nodeEls.forEach(node => {
    const cs = (node.dataset.countries || '').split(',').filter(Boolean);
    for (const c of cs) {
      if (!allCountries.includes(c)) allCountries.push(c);
    }
  });

  const countryAngle = buildCountryAngles(allCountries);
  const jitterSpan = Math.PI / Math.max(allCountries.length * 2, 8);

  // Radius must fit inside the container with padding for node size
  const padW = isMobile ? 60 : 90;
  const padH = isMobile ? 40 : 55;
  const usableW = (rect.width - padW * 2) / 2;
  const usableH = (rect.height - padH * 2) / 2;
  const maxR = Math.min(usableW, usableH);
  const minR = maxR * 0.5;

  // Compute initial positions based on country proximity
  const positions = [];
  nodeEls.forEach((node, i) => {
    const cs = (node.dataset.countries || '').split(',').filter(Boolean);
    // Average angle of all countries this node belongs to
    let sumSin = 0, sumCos = 0;
    for (const c of cs) {
      const a = countryAngle[c] ?? 0;
      sumCos += Math.cos(a);
      sumSin += Math.sin(a);
    }
    const angle = Math.atan2(sumSin, sumCos);
    // Spread within sector: add slight offset based on index
    const jitter = (i / Math.max(count, 1) - 0.5) * jitterSpan;
    const finalAngle = angle + jitter;

    // Distance: single-country nodes are closer, multi-country further out
    const countrySpan = cs.length;
    const t = countrySpan <= 1 ? 0.65 : countrySpan <= 2 ? 0.8 : 1.0;
    const r = minR + (maxR - minR) * t;

    positions.push({ x: cx + r * Math.cos(finalAngle), y: cy + r * Math.sin(finalAngle) });
  });

  // Measure actual rendered node sizes (they vary by content length)
  const GAP = 12;
  const sizes = [];
  nodeEls.forEach(node => {
    // Temporarily position off-screen to measure
    node.style.left = '-9999px';
    node.style.top = '-9999px';
    node.style.visibility = 'hidden';
  });
  // Force layout so measurements are accurate
  void container.offsetHeight;
  nodeEls.forEach(node => {
    sizes.push({ w: node.offsetWidth, h: node.offsetHeight });
    node.style.visibility = '';
  });

  // Keep outer nodes clear of the center card, which never moves.
  const centerEl = container.querySelector('.diagram-center');
  const boxes = positions.map((p, i) => ({ x: p.x, y: p.y, w: sizes[i].w, h: sizes[i].h }));
  // Clamping to bounds every pass fights the separation, so the solver needs
  // more than the default 50 rounds to converge in a tight container. At this
  // card count each round is a few hundred operations.
  separate(boxes, { width: rect.width, height: rect.height }, {
    iterations: 200,
    gap: GAP,
    pinned: [{
      x: cx,
      y: cy,
      w: centerEl ? centerEl.offsetWidth : 160,
      h: centerEl ? centerEl.offsetHeight : 80,
    }],
  });
  boxes.forEach((b, i) => { positions[i].x = b.x; positions[i].y = b.y; });

  linesSvg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  linesSvg.innerHTML = '';

  nodeEls.forEach((node, i) => {
    const { x, y } = positions[i];

    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.animationDelay = `${i * 70}ms`;

    const nodeColor = getComputedStyle(node).getPropertyValue('--node-color').trim() || 'rgba(255,255,255,0.15)';

    // Curved connector from center to node
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len * 25;
    const perpY = dx / len * 25;
    const cpx = (cx + x) / 2 + perpX;
    const cpy = (cy + y) / 2 + perpY;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${cx},${cy} Q${cpx},${cpy} ${x},${y}`);
    path.setAttribute('stroke', nodeColor);
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-opacity', '0.25');
    path.setAttribute('stroke-dasharray', '6 4');
    path.setAttribute('fill', 'none');
    path.classList.add('diagram-line');
    path.style.animationDelay = `${i * 70}ms`;
    linesSvg.appendChild(path);
  });
}

/**
 * Announce the open concept for screen readers. The globe is aria-hidden, so
 * without this the cross-country mapping would be visual only.
 */
function announceConcept(concept, displayNodes, countries) {
  const live = $('diagramLive');
  if (!live) return;
  const parts = displayNodes.slice(0, 12).map(v => {
    const names = v.countries.map(c => countries[c]?.name || c).join(', ');
    return `${v.term} en ${names}`;
  });
  live.textContent = `${concept.meaning_en}: ${displayNodes.length} equivalentes. ${parts.join('. ')}.`;
}

export function renderBrowse(s) {
  if (s.query) return;
  if (s.mode === 'expressions') return renderBrowseExpressions(s);
  const browse = $('browseArea');
  const intro = $('introState');
  const diagram = $('diagramArea');
  const area = $('resultsArea');

  if (!s.dictionary) return;

  const concepts = browseConcepts(s.dictionary, s.activeCountry, s.activeCategory);
  if (!concepts.length) {
    browse.innerHTML = '<div class="no-results">No hay resultados con estos filtros.</div>';
    return;
  }

  const countries = getCountries(s.dictionary);

  // Group by category
  const byCategory = {};
  for (const c of concepts) {
    if (!byCategory[c.category]) byCategory[c.category] = [];
    byCategory[c.category].push(c);
  }

  let html = '';
  for (const [cat, items] of Object.entries(byCategory)) {
    const sectionId = `browse-${cat}`;
    html += `<div class="browse-section">
      <h2 class="browse-heading">${categoryIcon(cat)} ${categoryLabel(cat)} <span style="color:var(--text-muted);font-weight:400;font-size:var(--text-sm)">(${items.length})</span></h2>
      <div class="browse-grid" id="${sectionId}">`;
    for (let idx = 0; idx < items.length; idx++) {
      const concept = items[idx];
      const hidden = idx >= 3 ? ' hidden' : '';
      if (s.activeCountry) {
        const cv = concept.variants.find(v => v.countries.includes(s.activeCountry));
        const heroTerm = cv ? cv.term : concept.variants[0].term;
        const heroFlag = countries[s.activeCountry]?.flag || '';
        const others = concept.variants.filter(v => v !== cv).slice(0, 3);
        const translations = others.map(v => {
          const fl = v.countries.map(c => countries[c]?.flag || c).join('');
          return `<span class="browse-term">${escHtml(v.term)} <span class="browse-term-flags">${fl}</span></span>`;
        }).join('');
        const more = others.length < concept.variants.length - 1 ? `<span class="browse-more">+${concept.variants.length - 1 - others.length}</span>` : '';
        html += `<button class="browse-card${hidden}" data-concept="${escHtml(concept.id)}">
          <div class="browse-hero">${escHtml(heroTerm)} <span class="browse-hero-flag">${heroFlag}</span></div>
          <div class="browse-terms">${translations}${more}</div>
          <div class="browse-meaning">${escHtml(concept.meaning_en)}</div>
        </button>`;
      } else {
        const heroTerms = concept.variants.slice(0, 3).map(v => {
          const fl = v.countries.map(c => countries[c]?.flag || c).join('');
          return `<span class="browse-term">${escHtml(v.term)} <span class="browse-term-flags">${fl}</span></span>`;
        }).join('');
        const more = concept.variants.length > 3 ? `<span class="browse-more">+${concept.variants.length - 3}</span>` : '';
        html += `<button class="browse-card${hidden}" data-concept="${escHtml(concept.id)}">
          <div class="browse-hero">${escHtml(concept.meaning_en)}</div>
          <div class="browse-terms">${heroTerms}${more}</div>
        </button>`;
      }
    }
    html += `</div>`;
    if (items.length > 3) {
      html += `<button class="browse-expand" data-section="${sectionId}">
        Ver ${items.length - 3} más
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>`;
    }
    html += `</div>`;
  }

  browse.innerHTML = html;
  browse.classList.remove('hidden');
  intro.classList.remove('hidden');
  diagram.classList.add('hidden');
  area.innerHTML = '';
}

export function relayout() {
  const s = state;
  if (!s.activeConcept) return;
  const diagram = $('diagramArea');
  const center = $('diagramCenter');
  const nodes = $('diagramNodes');
  const lines = $('diagramLines');
  if (diagram.classList.contains('hidden')) return;
  sizeDiagram(diagram);
  const count = nodes.querySelectorAll('.diagram-node').length;
  layoutDiagram(diagram, center, nodes, lines, count);
}


/* -- Expressions mode --------------------------------------------------------
   One country per phrase, so the grouping is by country rather than category,
   and there is no cross-country row to build. A card is closed until asked:
   the literal reading is the joke and the meaning is the punchline, and
   printing both at once on 71 cards gives the reader no reason to look.
   -------------------------------------------------------------------------- */

export function renderExpressionCard(e, s, open = false) {
  const meta = getCountries(s.dictionary)[e.country] || {};
  return `<button class="expr-card${open ? ' is-open' : ''}" data-expression="${escHtml(e.id)}"
                  aria-expanded="${open ? 'true' : 'false'}">
    <div class="expr-phrase">${escHtml(e.phrase)} <span class="expr-flag">${meta.flag || ''}</span></div>
    <div class="expr-reveal">
      <div class="expr-reveal-inner">
        <div class="expr-line expr-literal">
          <span class="expr-tag">Suena a</span>
          <span class="expr-text">${escHtml(e.literal)}</span>
        </div>
        <div class="expr-line expr-meaning">
          <span class="expr-tag">Quiere decir</span>
          <span class="expr-text">${escHtml(e.meaning)}</span>
        </div>
      </div>
    </div>
  </button>`;
}

export function renderExpressionResults(results, s) {
  const area = $('resultsArea');
  const intro = $('introState');
  const diagram = $('diagramArea');
  const browse = $('browseArea');

  intro.classList.add('hidden');
  diagram.classList.add('hidden');
  browse.classList.add('hidden');

  area.innerHTML = results.length
    ? results.map((e) => renderExpressionCard(e, s, results.length === 1)).join('')
    : '<div class="no-results">Ninguna expresi\u00f3n coincide. Prueba con el significado, no s\u00f3lo con la frase.</div>';
}

function renderBrowseExpressions(s) {
  const browse = $('browseArea');
  const intro = $('introState');
  const diagram = $('diagramArea');
  const area = $('resultsArea');

  if (!s.expressions) return;

  area.innerHTML = '';
  diagram.classList.add('hidden');
  intro.classList.remove('hidden');
  browse.classList.remove('hidden');

  const countries = getCountries(s.dictionary);
  const items = browseExpressions(s.expressions, s.activeCountry);
  if (!items.length) {
    browse.innerHTML = '<div class="no-results">Todav\u00eda no hay expresiones de este pa\u00eds.</div>';
    return;
  }

  const groups = groupByCountry(items, Object.keys(countries));
  let html = '';
  for (const [code, list] of groups) {
    const meta = countries[code] || {};
    html += `<div class="browse-section expr-section">
      <h2 class="browse-heading">${meta.flag || ''} ${escHtml(meta.name || code)}
        <span class="browse-count">(${list.length})</span></h2>
      <div class="expr-list">${list.map((e) => renderExpressionCard(e, s)).join('')}</div>
    </div>`;
  }
  browse.innerHTML = html;
}
