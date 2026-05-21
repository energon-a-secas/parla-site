// -- Entry point --
// Import modules and initialize the app.
// Keep this file under 50 lines.

import { state, loadSaved } from './state.js';
import { loadDictionary } from './data.js';
import { render, renderIntro, showDiagram } from './render.js';
import { bindEvents } from './events.js';
import { initBackground } from './diagram.js';

async function init() {
  loadSaved(state);
  await loadDictionary(state);
  renderIntro(state);
  render(state);
  bindEvents(state);
  initBackground(state.dictionary);
  openFromHash(state);

  window.addEventListener('hashchange', () => openFromHash(state));
}

function openFromHash(s) {
  const hash = window.location.hash;
  if (!hash.startsWith('#w=') || !s.dictionary) return;
  const conceptId = decodeURIComponent(hash.slice(3));
  const concept = s.dictionary.concepts.find(c => c.id === conceptId);
  if (!concept) return;
  const variant = s.activeCountry
    ? concept.variants.find(v => v.countries.includes(s.activeCountry)) || concept.variants[0]
    : concept.variants[0];
  showDiagram(concept, variant, s);
}

init();
