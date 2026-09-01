// -- Event handlers --
// All event listeners and user interaction handlers.

import { state, save } from './state.js';
import { search } from './data.js';
import { searchExpressions, findExpression } from './expressions.js';
import { render, renderResults, renderBrowse, showDiagram, relayout, dismissWordOfDayForToday,
  getWordOfDayData, renderExpressionResults } from './render.js';
import { focusCountry, clearConcept, relayoutStage, isGlobeMode, setCountryPickHandler,
  setViewChangeHandler, resetView, isHomeView } from './diagram.js';
import { $, debounce, showToast } from './utils.js';
import { escHtml } from './neorgon-dom.js';

export function bindEvents(s) {
  // -- Results sheet --------------------------------------------------------
  // One control over the results surface, so search, browse, concept-open and
  // Escape all agree on whether it is showing.
  const sheet = $('resultsSheet');
  const sheetToggle = $('sheetToggle');

  function setSheet(open) {
    if (!sheet) return;
    sheet.classList.toggle('is-open', open);
    sheetToggle?.setAttribute('aria-expanded', String(open));
    // A closed sheet is only max-height:0 and opacity:0, so without this its
    // contents stay in the tab order: the mode switch, both filters and every
    // rendered browse card, invisible, inside a zero-height box. Measured at
    // 200 reachable controls in Expresiones mode.
    // Only the stage's sheet collapses. In the fallback it is not a sheet at
    // all, it is the page: nothing hides it and `body.no-webgl .sheet-toggle`
    // is display:none, so marking it inert at bind time left every browse
    // card, both filters and the mode switch visible and unclickable, with no
    // control anywhere on the page able to undo it.
    sheet.inert = !open && document.body.classList.contains('globe-mode');
  }
  setSheet(false);   // the sheet ships closed, and nothing else calls this at boot
  function sheetOpen() {
    return !!sheet?.classList.contains('is-open');
  }

  sheetToggle?.addEventListener('click', () => setSheet(!sheetOpen()));
  $('sheetGrab')?.addEventListener('click', () => setSheet(false));
  window.addEventListener('parla:concept', () => setSheet(false));

  // Compact cards on narrow viewports. Set as a class rather than by media
  // query alone because the collision solver measures the rendered size.
  const narrow = window.matchMedia('(max-width: 600px)');
  const applyDensity = () => {
    $('diagramArea')?.classList.toggle('is-compact', narrow.matches);
    document.querySelectorAll('.diagram-node')
      .forEach(n => n.classList.toggle('diagram-node--compact', narrow.matches));
  };
  narrow.addEventListener('change', applyDensity);
  window.addEventListener('parla:concept', applyDensity);

  // Search input
  const input = $('searchInput');
  const clearBtn = $('searchClear');

  function runSearch() {
    s.query = input.value.trim();
    clearBtn.classList.toggle('hidden', !s.query);

    if (!s.query) {
      s.activeConcept = null;
      s.matchedTerm = null;
      $('resultsArea').innerHTML = '';
      $('introState').classList.remove('hidden');
      $('diagramArea').classList.add('hidden');
      renderBrowse(s);
      focusCountry(s.activeCountry);
      setSheet(false);
      return;
    }

    $('introState').classList.add('hidden');
    if (s.mode === 'expressions') {
      // Always opens the sheet: an expression answers in place, so there is no
      // single-result shortcut onto the globe to take instead.
      setSheet(true);
      renderExpressionResults(searchExpressions(s.expressions, s.query, s.activeCountry), s);
      return;
    }
    const results = search(s.dictionary, s.query, s.activeCountry, s.activeCategory);
    if (results.length !== 1) setSheet(true);
    renderResults(results, s);
  }

  const doSearch = debounce(runSearch, 180);

  input.addEventListener('input', doSearch);

  clearBtn.addEventListener('click', () => {
    input.value = '';
    s.query = '';
    s.activeConcept = null;
    s.matchedTerm = null;
    clearBtn.classList.add('hidden');
    $('resultsArea').innerHTML = '';
    $('introState').classList.remove('hidden');
    $('diagramArea').classList.add('hidden');
    renderBrowse(s);
    focusCountry(s.activeCountry);
    setSheet(false);
    input.focus();
  });

  // Picking a country on the globe is the same act as choosing it in the
  // filter, so it goes through the same path and syncs the select.
  setCountryPickHandler((code) => {
    // Clicking the country you already have selected clears it, so the globe
    // is a toggle rather than a one-way trip into a filter.
    const next = s.activeCountry === code ? null : code;
    selectCountry(next);
    // Picking a country is a request to see that country's slang, so open the
    // panel on it rather than silently changing a filter behind a closed sheet.
    setSheet(!!next);
  });

  setViewChangeHandler(syncResetControl);

  // Delegated: renderCountryPanel() rebuilds the button on every country
  // change, so a listener bound to the element would be thrown away with it.
  $('countryPanel')?.addEventListener('click', (e) => {
    if (!e.target.closest('#countryPanelClear')) return;
    clearCountry();             // identical to the stage's reset control
  });

  $('globeReset')?.addEventListener('click', clearCountry);

  /** Drop the country filter, send the camera home, put the sheet away.
   *  Two controls offer this (the stage's reset and the panel's Quitar) and
   *  they have to do the same thing: the panel lives inside the sheet, so a
   *  version that cleared the filter and left the sheet open left the visitor
   *  looking at the empty space its own head had just vacated. */
  function clearCountry() {
    selectCountry(null);
    resetView();
    setSheet(false);
  }

  /** Single path for changing the active country, whatever triggered it. */
  function selectCountry(code) {
    s.activeCountry = code || null;
    $('countrySelect').value = s.activeCountry || '';
    save(s);
    render(s);
    focusCountry(s.activeCountry);
    if (s.query) doSearch();
    else renderBrowse(s);
    // Clearing the country commands the camera home, so the control can hide on
    // that intent rather than waiting for the render loop to report a settle.
    syncResetControl(!s.activeCountry);
  }

  function syncResetControl(home = isHomeView()) {
    const btn = $('globeReset');
    if (!btn) return;
    const useful = isGlobeMode() && (!!s.activeCountry || !home);
    btn.classList.toggle('hidden', !useful);
  }

  // -- Mode switch ----------------------------------------------------------
  // Palabras and Expresiones share the country filter and the globe; they do
  // not share the category filter, which only the dictionary has, or the open
  // concept, which would otherwise survive into a mode that cannot draw it.
  /** Idempotent: paints the chrome for whatever s.mode already is. Called once
   *  at bind time so a mode restored from localStorage owns the switch, the
   *  placeholder and the body class it was saved with. */
  function syncModeUI() {
    for (const btn of document.querySelectorAll('.mode-btn')) {
      const on = btn.dataset.mode === s.mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    }
    document.body.classList.toggle('mode-expressions', s.mode === 'expressions');
    input.placeholder = s.mode === 'expressions'
      ? 'dar papaya, estar al horno\u2026'
      : 'bac\u00e1n, chido, pega, foda\u2026';
  }
  syncModeUI();

  function setMode(mode) {
    if (s.mode === mode) return;
    s.mode = mode;
    s.activeConcept = null;
    s.activeExpression = null;
    s.matchedTerm = null;
    clearConcept();
    save(s);
    syncModeUI();

    $('diagramArea').classList.add('hidden');
    $('resultsArea').innerHTML = '';
    $('introState').classList.remove('hidden');
    render(s);              // render() ends in renderBrowse(), which no-ops mid-query
    if (s.query) runSearch();
    setSheet(true);
  }

  $('modeSwitch')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-btn');
    if (btn) setMode(btn.dataset.mode);
  });

  // -- Expression cards ------------------------------------------------------
  // One open at a time, and opening one sends the camera to its country, so
  // the globe keeps answering the question the sheet is answering.
  function toggleExpression(card) {
    const expr = findExpression(s.expressions, card.dataset.expression);
    if (!expr) return;
    const wasOpen = card.classList.contains('is-open');
    for (const other of document.querySelectorAll('.expr-card.is-open')) {
      other.classList.remove('is-open');
      other.setAttribute('aria-expanded', 'false');
    }
    if (wasOpen) {
      s.activeExpression = null;
      return;
    }
    card.classList.add('is-open');
    card.setAttribute('aria-expanded', 'true');
    s.activeExpression = expr.id;
    focusCountry(expr.country);
    syncResetControl(false);

    // The sheet is short and the reveal grows downward, so a card opened near
    // the fold shows its phrase and hides the answer. Waits out the reveal
    // transition, otherwise it scrolls to the collapsed height.
    const settle = () => card.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    card.addEventListener('transitionend', settle, { once: true });
    setTimeout(settle, 350);   // transitionend does not fire if the card was already open-height
  }

  for (const id of ['browseArea', 'resultsArea']) {
    $(id).addEventListener('click', (e) => {
      const card = e.target.closest('[data-expression]');
      if (card) toggleExpression(card);
    });
  }

  // Country filter dropdown
  $('countrySelect').addEventListener('change', (e) => {
    selectCountry(e.target.value || null);
  });

  // Category filter dropdown
  $('categorySelect').addEventListener('change', (e) => {
    s.activeCategory = e.target.value || null;
    save(s);
    render(s);
    if (s.query) doSearch();
    else renderBrowse(s);
  });

  // Click result card to show diagram
  $('resultsArea').addEventListener('click', (e) => {
    const card = e.target.closest('[data-concept]');
    if (!card) return;
    const concept = s.dictionary.concepts.find(c => c.id === card.dataset.concept);
    if (!concept) return;
    const termStr = card.dataset.term || '';
    const variant = concept.variants.find(v => v.term === termStr) || concept.variants[0];
    showDiagram(concept, variant, s);
  });

  // Close diagram: called by Back button, ESC, and popstate
  function closeDiagram(clearHistory = true) {
    if ($('diagramArea').classList.contains('hidden')) return;
    s.activeConcept = null;
    s.matchedTerm = null;
    if (clearHistory) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    $('diagramArea').classList.add('hidden');
    clearConcept();
    focusCountry(s.activeCountry);
    if (s.query) {
      renderResults(search(s.dictionary, s.query, s.activeCountry, s.activeCategory), s, false);
      setSheet(true);
    } else {
      renderBrowse(s);
    }
  }

  // Back & share buttons (delegated on diagramArea — controls live inside diagramCenter)
  $('diagramArea').addEventListener('click', (e) => {
    if (e.target.closest('#diagramShare')) {
      const btn = e.target.closest('#diagramShare');
      const url = window.location.href;
      const term = document.querySelector('.center-term')?.textContent?.trim() || 'a slang word';
      const shareData = { title: `Parla: ${term}`, text: `Check out "${term}" on Parla, the Latin American slang map`, url };
      // navigator.clipboard is undefined outside a secure context, and the
      // ternary used to evaluate .writeText eagerly, so testing over the LAN
      // threw a TypeError before .then was ever attached. The two paths also
      // reported the same thing: a native share is not a copied link.
      const shared = navigator.share && navigator.canShare?.(shareData);
      const doShare = shared
        ? navigator.share(shareData)
        : navigator.clipboard
          ? navigator.clipboard.writeText(url)
          : Promise.reject(new Error('clipboard unavailable'));
      doShare.then(() => {
        if (shared) return;
        const originalHTML = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> Copied!`;
        showToast('Link copied');
        setTimeout(() => { btn.innerHTML = originalHTML; btn.classList.remove('copied'); }, 2000);
      }).catch((err) => {
        // AbortError is the visitor dismissing the share sheet, not a failure.
        if (err?.name !== 'AbortError') showToast('No se pudo copiar el enlace');
      });
      return;
    }
    if (e.target.closest('#diagramBack')) {
      if (s.diagramPushedState) {
        s.diagramPushedState = false;
        history.back(); // triggers popstate → closeDiagram
      } else {
        closeDiagram(true);
      }
    }
  });


  // Trackpad / browser back gesture
  window.addEventListener('popstate', () => {
    if (!$('diagramArea').classList.contains('hidden')) {
      s.diagramPushedState = false;
      closeDiagram(false); // browser already updated URL
    }
  });

  // Tapping a term card aims the globe at the country it belongs to.
  $('diagramNodes')?.addEventListener('click', (e) => {
    const node = e.target.closest('.diagram-node');
    if (!node) return;
    const first = (node.dataset.countries || '').split(',').filter(Boolean)[0];
    if (first) focusCountry(first);
  });

  // -- Usage examples -------------------------------------------------------
  // The node is already a button, so a nested info button would be invalid
  // markup. The glyph only marks that an example exists; the node is the
  // trigger, which gives hover, focus and tap for free and one target on
  // touch. The example also rides the node's aria-label, so this popover is
  // an enhancement rather than the only way to reach it.
  const pop = $('usagePop');

  function hideUsage() {
    if (!pop) return;
    pop.classList.add('hidden');
    pop.setAttribute('aria-hidden', 'true');
  }

  function showUsage(node) {
    const text = node?.dataset.usage;
    if (!pop || !text) return hideUsage();
    pop.innerHTML = `<span class="usage-label">Se usa así</span>${escHtml(text)}`;
    pop.classList.remove('hidden');
    pop.setAttribute('aria-hidden', 'false');
    // On a phone there is no room to anchor: the stage is narrow, the cards are
    // compact, and an anchored popover lands on the hero card as often as not.
    // It becomes a strip pinned above the dock instead, which CSS positions, so
    // the inline coordinates have to be cleared or they would win.
    if (narrow.matches) {
      pop.classList.add('usage-pop--pinned');
      pop.style.removeProperty('left');
      pop.style.removeProperty('top');
      return;
    }
    pop.classList.remove('usage-pop--pinned');
    // Measured after the content is in, then clamped to the viewport. Placed
    // above the node when there is room and below when there is not, so a node
    // near the top of the stage does not push the popover off screen.
    const n = node.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const pad = 10;
    let left = n.left + n.width / 2 - p.width / 2;
    let top = n.top - p.height - 8;
    if (top < pad) top = n.bottom + 8;
    left = Math.max(pad, Math.min(left, window.innerWidth - p.width - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - p.height - pad));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  const nodesWrap = $('diagramNodes');
  if (nodesWrap && pop) {
    const nodeFrom = (e) => e.target.closest('.diagram-node.has-usage');
    nodesWrap.addEventListener('pointerover', (e) => {
      const n = nodeFrom(e);
      if (n && e.pointerType !== 'touch') showUsage(n);
    });
    nodesWrap.addEventListener('pointerout', (e) => {
      if (nodeFrom(e) && e.pointerType !== 'touch') hideUsage();
    });
    // focusin/focusout rather than focus/blur: those do not bubble.
    nodesWrap.addEventListener('focusin', (e) => {
      const n = nodeFrom(e);
      if (n) showUsage(n);
    });
    nodesWrap.addEventListener('focusout', hideUsage);
    // Touch: the tap that focuses the country also shows the example.
    nodesWrap.addEventListener('click', (e) => {
      const n = nodeFrom(e);
      if (n) showUsage(n);
    });
    // Any camera move invalidates the anchor, so the popover goes rather than
    // hanging over empty ocean.
    window.addEventListener('parla:concept', hideUsage);
    document.addEventListener('scroll', hideUsage, true);
    window.addEventListener('resize', hideUsage);
  }

  // Expand/collapse browse sections
  $('browseArea').addEventListener('click', (e) => {
    const expandBtn = e.target.closest('.browse-expand');
    if (expandBtn) {
      const sectionId = expandBtn.dataset.section;
      const grid = document.getElementById(sectionId);
      if (!grid) return;
      const isExpanded = expandBtn.classList.toggle('expanded');
      grid.querySelectorAll('.browse-card').forEach((card, i) => {
        if (i >= 3) card.classList.toggle('hidden', !isExpanded);
      });
      expandBtn.innerHTML = isExpanded
        ? 'Ver menos <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>'
        : `Ver más <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`;
      return;
    }
    // Click browse card to show diagram
    const card = e.target.closest('[data-concept]');
    if (!card) return;
    const concept = s.dictionary.concepts.find(c => c.id === card.dataset.concept);
    if (!concept) return;
    showDiagram(concept, concept.variants[0], s);
  });

  // Example pills
  $('introExamples').addEventListener('click', (e) => {
    const pill = e.target.closest('[data-word]');
    if (!pill) return;
    input.value = pill.dataset.word;
    doSearch();
  });

  // Word of the day dialog
  const wodDialog = $('wodDialog');
  if (wodDialog) {
    wodDialog.addEventListener('click', (e) => {
      if (e.target.closest('#wodDismiss') || e.target.closest('#wodSkip')) {
        dismissWordOfDayForToday();
        return;
      }
      if (e.target.closest('#wodOpen')) {
        const data = getWordOfDayData(s);
        if (!data) return;
        const { concept, variant } = data;
        dismissWordOfDayForToday();
        input.value = variant.term;
        s.query = variant.term;
        clearBtn.classList.remove('hidden');
        $('introState').classList.add('hidden');
        showDiagram(concept, variant, s);
      }
    });

    wodDialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      dismissWordOfDayForToday();
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (wodDialog?.open) {
        e.preventDefault();
        dismissWordOfDayForToday();
        return;
      }
      if (!$('diagramArea').classList.contains('hidden')) {
        if (s.diagramPushedState) {
          s.diagramPushedState = false;
          history.back();
        } else {
          closeDiagram(true);
        }
        return;
      }
      if (sheetOpen() && isGlobeMode()) {
        setSheet(false);
        return;
      }
      if (s.query) {
        clearBtn.click();
        return;
      }
      // Last rung: a country filter is a thing the visitor is inside, so Escape
      // gets them out of it. The reset control is the discoverable route and
      // this is the fast one; both end at the same place, which is why both go
      // through clearCountry(). Its setSheet(false) is a no-op here, the sheet
      // rung above having already closed it.
      if (s.activeCountry) clearCountry();
      return;
    }

    if (e.key === '/' && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });

  // Relayout diagram on resize
  window.addEventListener('resize', debounce(() => {
    if (isGlobeMode()) relayoutStage();
    else relayout();
  }, 200));

  // A country filter restored from localStorage means the reset control is
  // already meaningful before the user has touched anything.
  syncResetControl();
}
