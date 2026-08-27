// -- State management --
// Shared mutable state object.

const STORAGE_KEY = 'parla-state';
const WOD_DISMISS_KEY = 'parla-wod-dismissed';

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isWodDismissedToday() {
  try {
    return localStorage.getItem(WOD_DISMISS_KEY) === todayKey();
  } catch {
    return false;
  }
}

export function dismissWodToday() {
  try {
    localStorage.setItem(WOD_DISMISS_KEY, todayKey());
  } catch { /* ignore */ }
}

export const MODES = ['words', 'expressions'];

export const state = {
  dictionary: null,
  expressions: null,
  mode: 'words',          // 'words' = the cross-country dictionary
                          // 'expressions' = one country's own idioms
  query: '',
  activeCountry: null,    // null = all countries
  activeCategory: null,   // null = all categories
  activeConcept: null,    // currently displayed concept
  activeExpression: null, // currently opened expression, in expressions mode
  matchedTerm: null,      // the term that matched the search
};

export function loadSaved(s) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.activeCountry) s.activeCountry = saved.activeCountry;
      if (saved.activeCategory) s.activeCategory = saved.activeCategory;
      if (MODES.includes(saved.mode)) s.mode = saved.mode;
    }
  } catch { /* ignore */ }
}

export function save(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeCountry: s.activeCountry,
      activeCategory: s.activeCategory,
      mode: s.mode,
    }));
  } catch { /* ignore */ }
}
