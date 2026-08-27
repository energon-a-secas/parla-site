// -- Colloquial expressions --
// The opposite shape to the dictionary. A concept there is one meaning wearing
// eight different words; an expression here is one phrase belonging to one
// country, whose surface reading tells you nothing about what it means. That
// gap between `literal` and `meaning` is the whole reason the section exists,
// so both are required and neither is optional.

const EXPRESSIONS_URL = 'api/v1/expressions.json';

export async function loadExpressions(s) {
  try {
    const res = await fetch(EXPRESSIONS_URL);
    if (!res.ok) throw new Error(`${EXPRESSIONS_URL} ${res.status}`);
    const doc = await res.json();
    s.expressions = doc.expressions;
  } catch (e) {
    console.error('Failed to load expressions:', e);
    s.expressions = [];
  }
}

function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Ranked, not indexed. 71 rows scanned per keystroke is under a millisecond,
 * and an inverted index here would have to be rebuilt to search the meanings,
 * which is how most people will actually arrive: they heard the phrase and
 * want the idea, or they have the idea and want the phrase.
 */
export function searchExpressions(list, query, countryFilter) {
  if (!list || !query.trim()) return [];
  const q = normalize(query);
  if (!q) return [];

  const scored = [];
  for (const e of list) {
    if (countryFilter && e.country !== countryFilter) continue;
    const phrase = normalize(e.phrase);
    let score = -1;
    if (phrase === q) score = 3;
    else if (phrase.startsWith(q)) score = 2;
    else if (phrase.includes(q)) score = 1;
    else if (normalize(e.meaning).includes(q) || normalize(e.literal).includes(q)) score = 0;
    if (score >= 0) scored.push({ expression: e, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((r) => r.expression);
}

export function browseExpressions(list, countryFilter) {
  if (!list) return [];
  return countryFilter ? list.filter((e) => e.country === countryFilter) : list;
}

/** Grouped by country, in the dictionary's own country order so the section
 *  headings match the order of the filter dropdown and the globe legend. */
export function groupByCountry(list, countryOrder) {
  const groups = new Map();
  for (const code of countryOrder) {
    const items = list.filter((e) => e.country === code);
    if (items.length) groups.set(code, items);
  }
  return groups;
}

export function findExpression(list, id) {
  return list?.find((e) => e.id === id) || null;
}

/** Backs the globe's country card while the Expresiones mode is on. */
export function sampleExpressions(list, code, n = 4) {
  return (list || []).filter((e) => e.country === code).slice(0, n);
}
