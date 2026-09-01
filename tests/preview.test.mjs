// Regression tests for the globe's country hover tip. Run with `make check`.
//
// These exist because of one shipped defect with two halves. The tip was
// `pointer-events: auto` and got placed on top of the pointer that summoned
// it, so it took the pointer, the canvas fired `pointerleave`, the overlay
// hid the tip, and the pointer was over the canvas again. That part is a
// layout fact and is checked in tests/stage.html, which has a laid-out page.
//
// The half that lives here is what the flicker made visible: every re-show
// called sampleTerms(), which shuffled the country's entire variant list with
// Math.random() and took five. So each flash showed different words, drawn
// uniformly from every row the country appears in, which put plain Spanish
// and the strongest insults in the file in front of anyone who moved a mouse.
// previewTerms() is a pure function of the dictionary, so the properties that
// fix matters are checkable without a browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { previewTerms } from '../js/data.js';

const root = new URL('../', import.meta.url);
const dict = JSON.parse(
  readFileSync(fileURLToPath(new URL('api/v1/dictionary.json', root)), 'utf8'),
);
const CODES = Object.keys(dict.countries);

const key = (rows) => rows.map((r) => r.term).join('|');

test('every country gets a preview, and it is the requested size', () => {
  for (const code of CODES) {
    const rows = previewTerms(dict, code, 3);
    assert.equal(rows.length, 3, `${code} previews ${rows.length} terms, not 3`);
    for (const row of rows) {
      assert.ok(row.term && row.term.trim(), `${code} previews an empty term`);
      assert.ok(row.meaning && row.meaning.trim(), `${code} previews an empty meaning`);
    }
  }
});

test('the preview is deterministic: same country, same words, every call', () => {
  for (const code of CODES) {
    const first = key(previewTerms(dict, code, 3));
    for (let i = 0; i < 200; i++) {
      assert.equal(key(previewTerms(dict, code, 3)), first,
        `${code} previewed a different set on call ${i + 2}`);
    }
  }
});

// The guard above is only worth having if it can fail. This is the retired
// implementation, kept so the determinism check cannot quietly stop meaning
// anything: if a future refactor makes previewTerms random again, the check
// above goes red, and this proves the check is capable of going red at all.
function retiredSampleTerms(d, code, n) {
  const pool = [];
  for (const concept of d.concepts) {
    for (const v of concept.variants) {
      if (v.countries.includes(code)) pool.push({ term: v.term, meaning: concept.meaning_en });
    }
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

test('the pre-fix implementation fails that determinism check', () => {
  // Over 200 draws of 5 from a pool of ~180, an identical result every time is
  // not something that happens; if it ever does, the check above is asleep.
  const first = key(retiredSampleTerms(dict, 'CO', 5));
  let differed = false;
  for (let i = 0; i < 200 && !differed; i++) {
    if (key(retiredSampleTerms(dict, 'CO', 5)) !== first) differed = true;
  }
  assert.ok(differed, 'the retired shuffle was stable, so this file proves nothing');
});

// The tip is what a visitor sees for simply moving the mouse, so what lands in
// it is a content decision, not an implementation detail. Pinned literally:
// reordering the concepts, renaming a flagship one, or changing the selection
// rule all move these words, and all of them should make a person look rather
// than pass quietly. A `preview: false` flag was tried instead and deleted; it
// changed the output for none of the eight countries at any size.
const EXPECTED = {
  CL: ["bacán", "wena", "cagarla"],
  CO: ["bacano", "quiubo", "embarrarla"],
  AR: ["copado", "che", "cagarla"],
  MX: ["chido", "qué onda", "cagarla"],
  PE: ["chévere", "habla", "cagarla"],
  VE: ["chévere", "épale", "cagar"],
  BR: ["da hora", "e aí", "cagar tudo"],
  US: ["chido", "qué onda", "cagarla"]
};

test('the previewed words are the flagship ones, and have not drifted', () => {
  for (const [code, want] of Object.entries(EXPECTED)) {
    assert.deepEqual(previewTerms(dict, code, 3).map((r) => r.term), want,
      `${code}'s hover tip changed; check the new words are ones to greet a visitor with`);
  }
});

// The defect this file exists for put `pedazo de mierda` in a tooltip that
// appeared because somebody moved a mouse. The ordering rule keeps the strong
// block out by never reaching the insults category at three rows, but that is
// a consequence of concept order, and concept order is editable.
const CRUDE = [
  'motherfucker-cunt', 'piece-of-shit', 'asshole-dickhead', 'whore-slut',
  'bastard-scoundrel', 'dumbass-moron', 'shithead-shitface', 'fuck-you',
  'chile-specific-insults', 'jerk',
];

test('no country previews a term from the strong-insult block', () => {
  const barred = new Set();
  for (const id of CRUDE) {
    const concept = dict.concepts.find((c) => c.id === id);
    assert.ok(concept, `${id} is gone from the dictionary; this list needs updating`);
    for (const v of concept.variants) barred.add(v.term.toLowerCase());
  }
  for (const code of CODES) {
    for (const row of previewTerms(dict, code, 3)) {
      assert.ok(!barred.has(row.term.toLowerCase()),
        `${code} previews ${row.term}, which is in the strong-insult block`);
    }
  }
});

test('the three previewed terms come from three different categories', () => {
  for (const code of CODES) {
    const rows = previewTerms(dict, code, 3);
    const cats = rows.map((row) => dict.concepts.find(
      (c) => c.meaning_en === row.meaning
        && c.variants.some((v) => v.term === row.term),
    )?.category);
    assert.equal(new Set(cats).size, 3,
      `${code} previews ${cats.join('/')}, which repeats a category`);
  }
});

test('a country with no data, and a missing dictionary, return nothing', () => {
  assert.deepEqual(previewTerms(dict, 'ZZ', 3), []);
  assert.deepEqual(previewTerms(dict, null, 3), []);
  assert.deepEqual(previewTerms(null, 'CL', 3), []);
});
