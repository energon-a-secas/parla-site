// Generic helpers come from the DOM Kit (js/neorgon-dom.js, vendored from
// packages/neorgon-ui/dom/). They are re-exported so every existing
// `import { escHtml } from './utils.js'` keeps working.
//
// Do not edit js/neorgon-dom.js. Edit the canonical source and run
// packages/neorgon-ui/sync-dom.sh.
import { escHtml, debounce, showToast as kitToast } from './neorgon-dom.js';
export { escHtml, debounce };

// -- Shared utilities --

const _els = {};
export function $(id) {
  return _els[id] || (_els[id] = document.getElementById(id));
}


/** This site's own toast contract, rendered by the kit. */
export function showToast(msg) {
  return kitToast(msg, { id: 'app-toast', className: 'toast',
    visibleClass: 'visible', duration: 2000 });
}


/**
 * WebGL pre-flight. Lives here, not in globe3d.js, because a static import of
 * that module would pull three.js into the graph and download 656 KB on the
 * exact devices this check exists to spare. Append ?nogl=1 to force the
 * fallback path.
 */
export function webglSupported() {
  if (new URLSearchParams(location.search).has('nogl')) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}


const CATEGORY_LABELS = {
  greetings: 'Saludos',
  insults: 'Insultos',
  adjectives: 'Adjetivos',
  work: 'Trabajo',
  daily: 'Cotidiano',
};

export function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

const CATEGORY_ICONS = {
  greetings: '<svg class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  insults: '<svg class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  adjectives: '<svg class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  work: '<svg class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  daily: '<svg class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9h18M3 15h18"/><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>',
};

export function categoryIcon(cat) {
  return CATEGORY_ICONS[cat] || '';
}
