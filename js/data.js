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
      if (countryFilter && !variant.countries.includes(countryFilter)) continue;
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
        if (countryFilter && !variant.countries.includes(countryFilter)) continue;
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
        if (countryFilter && !variant.countries.includes(countryFilter)) continue;
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
      if (countryFilter) {
        const hasCountry = concept.variants.some(v => v.countries.includes(countryFilter));
        if (!hasCountry) continue;
      }
      const matchedVariant = concept.variants[0];
      seen.add(concept.id);
      results.push({ concept, matchedVariant, score: 0 });
    }
  }

  results.sort((a, b) => b.score - a.score);
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

export function getCountries(dict) {
  return dict ? dict.countries : {};
}

export function getCategories(dict) {
  if (!dict) return [];
  const cats = new Set();
  for (const c of dict.concepts) cats.add(c.category);
  return [...cats];
}
