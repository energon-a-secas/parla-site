// -- Usage examples --
// One short sentence per variant, showing the word in a real situation rather
// than defining it. Kept out of dictionary.json on purpose: that file gates the
// first render and the search index, and this is only ever needed once someone
// has opened a word.
//
// Loaded lazily, started once the stage is up so it has almost always landed by
// the time anyone opens a concept. When it lands late it announces itself and
// whatever is on screen redraws, rather than leaving a word with no example.

const USAGE_URL = 'api/v1/usage.json';

let usage = null;
let inflight = null;

export const usageKey = (conceptId, term) => `${conceptId}|${term.toLowerCase()}`;

/** Idempotent and safe to call from anywhere; the fetch happens at most once. */
export function loadUsage() {
  if (usage) return Promise.resolve(usage);
  if (inflight) return inflight;
  inflight = fetch(USAGE_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`${USAGE_URL} ${r.status}`);
      return r.json();
    })
    .then((doc) => {
      usage = doc.usage || {};
      window.dispatchEvent(new CustomEvent('parla:usage-ready'));
      return usage;
    })
    .catch((e) => {
      // Not fatal: every surface treats a missing example as "no info button".
      console.info('Parla: usage examples unavailable.', e.message);
      usage = {};
      return usage;
    });
  return inflight;
}

/** The example for one variant, or null. Never throws, never blocks. */
export function usageFor(conceptId, term) {
  if (!usage || !conceptId || !term) return null;
  return usage[usageKey(conceptId, term)] || null;
}

export function usageReady() {
  return usage !== null;
}
