// -- Data loading and search --
// Load dictionary JSON, build search index, find matches.

const DICT_URL = 'api/v1/dictionary.json';

export async function loadDictionary(s) {
  try {
    const res = await fetch(DICT_URL);
    s.dictionary = await res.json();
    buildIndex(s.dictionary);
  } catch (e) {
    console.error('Failed to load dictionary:', e);
  }
}

// Inverted index: normalized term -> [{ concept, variant }]
let _index = new Map();

function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function buildIndex(dict) {
  _index.clear();
  for (const concept of dict.concepts) {
    for (const v of concept.variants) {
      const key = normalize(v.term);
      if (!_index.has(key)) _index.set(key, []);
      _index.get(key).push({ concept, variant: v });

      // Also index individual words for multi-word terms
      const words = key.split(/\s+/);
      if (words.length > 1) {
        for (const w of words) {
          if (w.length > 2) {
            if (!_index.has(w)) _index.set(w, []);
            _index.get(w).push({ concept, variant: v });
          }
        }
      }
    }
  }
}

export function search(dict, query, countryFilter, categoryFilter) {
  if (!dict || !query.trim()) return [];
  const q = normalize(query);
  if (!q) return [];

  const results = [];
  const seen = new Set();

  // Exact match first
  const exact = _index.get(q);
  if (exact) {
    for (const { concept, variant } of exact) {
      if (seen.has(concept.id)) continue;
      if (categoryFilter && concept.category !== categoryFilter) continue;
      seen.add(concept.id);
      results.push({ concept, matchedVariant: variant, score: 3 });
    }
  }

  // Prefix match
  for (const [key, entries] of _index) {
    if (key.startsWith(q) && key !== q) {
      for (const { concept, variant } of entries) {
        if (seen.has(concept.id)) continue;
        if (categoryFilter && concept.category !== categoryFilter) continue;
        seen.add(concept.id);
        results.push({ concept, matchedVariant: variant, score: 2 });
      }
    }
  }

  // Contains match
  for (const [key, entries] of _index) {
    if (key.includes(q) && !key.startsWith(q)) {
      for (const { concept, variant } of entries) {
        if (seen.has(concept.id)) continue;
        if (categoryFilter && concept.category !== categoryFilter) continue;
        seen.add(concept.id);
        results.push({ concept, matchedVariant: variant, score: 1 });
      }
    }
  }

  // English meaning match
  for (const concept of dict.concepts) {
    if (seen.has(concept.id)) continue;
    if (categoryFilter && concept.category !== categoryFilter) continue;
    const meaningNorm = normalize(concept.meaning_en);
    if (meaningNorm.includes(q)) {
      const matchedVariant = concept.variants[0];
      seen.add(concept.id);
      results.push({ concept, matchedVariant, score: 0 });
    }
  }

  // The country filter used to exclude. It now ranks, because a search is an
  // explicit request for a word and the filter only says which country the
  // reader cares about. Searching "laburo" while filtered to Chile reported
  // that the word does not exist, on a site whose whole purpose is telling you
  // that Argentina says laburo where Chile says pega. The four passes also
  // disagreed about what the filter even meant: three tested the matched
  // variant's countries, the fourth tested the whole concept's.
  const countryRank = (r) => {
    if (!countryFilter) return 0;
    if (r.matchedVariant.countries.includes(countryFilter)) return 2;
    if (r.concept.variants.some(v => v.countries.includes(countryFilter))) return 1;
    return 0;
  };
  results.sort((a, b) => (b.score - a.score) || (countryRank(b) - countryRank(a)));
  return results;
}

export function browseConcepts(dict, countryFilter, categoryFilter) {
  if (!dict) return [];
  return dict.concepts.filter(c => {
    if (categoryFilter && c.category !== categoryFilter) return false;
    if (countryFilter) {
      return c.variants.some(v => v.countries.includes(countryFilter));
    }
    return true;
  });
}

/**
 * The terms a country shows in the globe's hover tip.
 *
 * Deterministic by construction: one country always previews the same words.
 * The previous version shuffled the country's entire variant list with
 * Math.random() and took five, which had two consequences. The tip re-rolled
 * on every hover, so a country that flickered showed a different five each
 * time; and the draw was uniform over every row the country appears in, so a
 * country's shop window opened on `temprano` or on the strongest insult in the
 * file about as often as on its actual slang.
 *
 * The rule is the first concept of each category, in file order, which is
 * flagship order: the first adjective is `cool`, the first greeting is
 * `hey-casual`, the first thing you can do wrong is `mess-up`. So every
 * country answers the same three questions, and sweeping the pointer across
 * the map shows one idea changing its word, which is what this site is for.
 *
 * Taking one concept per category is also what keeps the crude end of the
 * insults out of a tip nobody asked for: at three rows the walk never reaches
 * the insults category at all, and at more it would stop at `idiot`. A
 * `preview: false` flag was added to the ten strongest concepts to enforce
 * that and then removed, because it changed the output for none of the eight
 * countries at any size, and a guard that cannot fail gets quoted as if it
 * were doing something. The ordering is the guard; tests/preview.test.mjs
 * pins the result so a reordering of the file cannot quietly change it.
 */
export function previewTerms(dict, code, n = 3) {
  if (!dict?.concepts || !code) return [];
  const out = [];
  const categories = new Set();
  for (const concept of dict.concepts) {
    if (categories.has(concept.category)) continue;
    const variant = concept.variants.find((v) => v.countries.includes(code));
    if (!variant) continue;               // category is claimed on a hit, not a miss
    categories.add(concept.category);
    out.push({ term: variant.term, meaning: concept.meaning_en });
    if (out.length === n) break;
  }
  return out;
}

/**
 * Collapse variants that spell the same term into one row, unioning their
 * countries. The dictionary stores `carro` twice, once for MX/CO/VE/PE/US and
 * once for BR, and every surface that renders variants has to agree on which
 * of those it is looking at. This used to live inside showDiagram(), which ran
 * it AFTER picking the hero card, so the hero showed the raw row's countries
 * and the merged row was then filtered out of the outer nodes: 17 concept/term
 * pairs had a country that appeared nowhere on screen.
 *
 * A note is kept only when every merged row agrees on it. First-note-wins put
 * "very Colombian" under the CO and VE flags on `juicioso`.
 */
export function mergeVariants(variants) {
  const merged = [];
  const byTerm = new Map();
  for (const v of variants) {
    const key = v.term.toLowerCase();
    const seen = byTerm.get(key);
    if (seen) {
      seen.countries = [...new Set([...seen.countries, ...v.countries])];
      if (seen.note !== v.note) seen.note = undefined;
    } else {
      const entry = { term: v.term, countries: [...v.countries], note: v.note };
      byTerm.set(key, entry);
      merged.push(entry);
    }
  }
  return merged;
}

export function getCountries(dict) {
  return dict ? dict.countries : {};
}

export function getCategories(dict) {
  if (!dict) return [];
  const cats = new Set();
  for (const c of dict.concepts) cats.add(c.category);
  return [...cats];
}
