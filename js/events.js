// -- Event handlers --
// All event listeners and user interaction handlers.

import { state, save } from './state.js';
import { search } from './data.js';
import { render, renderResults, renderBrowse, showDiagram, relayout, dismissWordOfDayForToday, getWordOfDayData } from './render.js';
import { focusCountry, clearConcept, relayoutStage, isGlobeMode, setCountryPickHandler,
  setViewChangeHandler, resetView, isHomeView } from './diagram.js';
import { $, debounce, showToast } from './utils.js';

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
  }
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

  const doSearch = debounce(() => {
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
    const results = search(s.dictionary, s.query, s.activeCountry, s.activeCategory);
    if (results.length !== 1) setSheet(true);
    renderResults(results, s);
  }, 180);

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

  $('globeReset')?.addEventListener('click', () => {
    selectCountry(null);   // clears the filter and sends the camera home
    resetView();
    setSheet(false);
  });

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
      const doShare = navigator.share && navigator.canShare?.(shareData)
        ? navigator.share(shareData)
        : navigator.clipboard.writeText(url);
      doShare.then(() => {
        const originalHTML = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> Copied!`;
        showToast('Link copied');
        setTimeout(() => { btn.innerHTML = originalHTML; btn.classList.remove('copied'); }, 2000);
      }).catch(() => {});
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
      }
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
