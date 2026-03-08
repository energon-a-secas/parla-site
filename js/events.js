// -- Event handlers --
// All event listeners and user interaction handlers.

import { state, save } from './state.js';
import { search } from './data.js';
import { render, renderResults, renderBrowse, showDiagram, relayout } from './render.js';
import { $, debounce, showToast } from './utils.js';

export function bindEvents(s) {
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
      return;
    }

    $('introState').classList.add('hidden');
    const results = search(s.dictionary, s.query, s.activeCountry, s.activeCategory);
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
    input.focus();
  });

  // Country filter dropdown
  $('countrySelect').addEventListener('change', (e) => {
    s.activeCountry = e.target.value || null;
    save(s);
    render(s);
    if (s.query) doSearch();
    else renderBrowse(s);
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
    if (s.query) {
      renderResults(search(s.dictionary, s.query, s.activeCountry, s.activeCategory), s);
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
      const shareData = { title: `Parla — ${term}`, text: `Check out "${term}" on Parla, the Latin American slang map`, url };
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

  // ESC to close diagram
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('diagramArea').classList.contains('hidden')) {
      if (s.diagramPushedState) {
        s.diagramPushedState = false;
        history.back();
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
        : `Ver mas <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`;
      return;
    }
    // Click browse card to show diagram
    const card = e.target.closest('[data-concept]');
    if (!card) return;
    const concept = s.dictionary.concepts.find(c => c.id === card.dataset.concept);
    if (!concept) return;
    showDiagram(concept, concept.variants[0], s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Example pills
  $('introExamples').addEventListener('click', (e) => {
    const pill = e.target.closest('[data-word]');
    if (!pill) return;
    input.value = pill.dataset.word;
    doSearch();
  });

  // Word of the day click
  $('wordOfDay')?.addEventListener('click', () => {
    const el = $('wordOfDay');
    const conceptId = el?.dataset.concept;
    const termStr = el?.dataset.term;
    if (!conceptId || !s.dictionary) return;
    const concept = s.dictionary.concepts.find(c => c.id === conceptId);
    if (!concept) return;
    const variant = concept.variants.find(v => v.term === termStr) || concept.variants[0];
    input.value = variant.term;
    s.query = variant.term;
    clearBtn.classList.remove('hidden');
    showDiagram(concept, variant, s);
  });

  // Keyboard: Escape clears search
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && s.query) {
      clearBtn.click();
    }
    // Focus search on / key
    if (e.key === '/' && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });

  // Relayout diagram on resize
  window.addEventListener('resize', debounce(() => relayout(), 200));
}
