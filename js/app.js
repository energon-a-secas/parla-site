// -- Entry point --
// Import modules and initialize the app.
// Keep this file under 50 lines.

import { state, loadSaved } from './state.js';
import { loadDictionary } from './data.js';
import { loadExpressions } from './expressions.js';
import { render, renderIntro, showDiagram, showWordOfDayDialog } from './render.js';
import { bindEvents } from './events.js';
import { initStage, focusCountry } from './diagram.js';

async function init() {
  loadSaved(state);
  // Fetched together: the mode is restored from localStorage, so the app can
  // come up in Expresiones and must not render an empty sheet while a second
  // request lands.
  await Promise.all([loadDictionary(state), loadExpressions(state)]);
  document.body.classList.toggle('mode-expressions', state.mode === 'expressions');
  renderIntro(state);
  render(state);
  bindEvents(state);

  // Fired before initStage because it needs only the dictionary. Waiting for
  // the stage made the dialog appear a beat after the page had settled.
  if (!window.location.hash.startsWith('#w=')) {
    showWordOfDayDialog(state);
  }

  // Must run after loadDictionary (it needs country colours and anchors) and
  // before openFromHash, so a deep link lands on a stage that already exists.
  await initStage(state.dictionary);
  focusCountry(state.activeCountry);
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
