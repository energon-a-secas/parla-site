// Regression tests for the camera fit. Run with `make check` (node --test).
//
// These exist because of one shipped defect: the dock covers the foot of the
// stage, the camera offsets its frustum to centre the globe in the band that
// is left, and the fit never learned that the band was smaller than the
// canvas. Every framing decision was solved for up to twice the height the
// visitor could see, so opening the Explore sheet drew a selected country at
// roughly 2x with its neighbours off every edge, and there was no way to click
// another country.
//
// No dependencies and no DOM: camerafit.js is pure trigonometry, and the
// country data is read straight off disk, so a new country or a moved anchor
// is checked against the same numbers the globe uses.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  FOV, HOME_FIT_ANGLE, FOCUS_FIT_ANGLE, FIT_PAD, FIT_PAD_NARROW, NARROW_PX,
  MAX_INSET_FRACTION, MIN_CAMERA_DISTANCE,
  fitDistance, fitAngle, fitPad, clampInset, visibleFraction,
  subtendedHalfAngle, visibleHalfAngle, maxCameraDistance,
} from '../js/camerafit.js';

const root = new URL('../', import.meta.url);
const json = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, root)), 'utf8'));

const DEG = Math.PI / 180;

// Stage shapes worth covering: desktop, laptop, the short window that made the
// dock cover most of the stage, portrait phone, and a wide short one.
const ASPECTS = [1440 / 783, 1280 / 443, 375 / 660, 900 / 243, 1.0];
// 0 is a closed sheet, 0.7 is the clamp; 0.625 is the measured open sheet.
const INSETS = [0, 0.1, 0.4, 0.625, 0.7];

// -- The invariant that broke ----------------------------------------------

test('a fitted cap never subtends more than the band the dock leaves', () => {
  for (const aspect of ASPECTS) {
    for (const inset of INSETS) {
      const visible = 1 - inset;
      for (const deg of [FOCUS_FIT_ANGLE, HOME_FIT_ANGLE, 10, 26]) {
        const view = { aspect, visible };
        assert.ok(
          subtendedHalfAngle(deg, view) <= visibleHalfAngle(view) + 1e-9,
          `cap ${deg} deg overflows the visible band at aspect ${aspect.toFixed(2)}, inset ${inset}`,
        );
      }
    }
  }
});

test('a fitted cap fills the band it was fitted to, and is not merely inside it', () => {
  // The assertion above is one-sided, and one-sided is not enough. Both of its
  // terms are derived from fitDistance (subtendedHalfAngle inverts it), so it
  // reduces to min(vertical, horizontal) <= vertical, which is true whatever
  // fitDistance does. It catches over-fitting and is blind to under-fitting:
  // squaring `visible` inside fitDistance draws the globe at a fraction of the
  // band and leaves every other test in this file green.
  //
  // visibleHalfAngle does NOT go through fitDistance, so comparing against it
  // is an independent measurement. The shipped fit fills the binding axis
  // exactly, so this is an equality with room only for float noise.
  const tanHalf = Math.tan((FOV * DEG) / 2);
  for (const aspect of ASPECTS) {
    for (const inset of INSETS) {
      const visible = 1 - inset;
      const view = { aspect, visible };
      const binding = Math.min(visibleHalfAngle(view), Math.atan(tanHalf * aspect));
      for (const deg of [FOCUS_FIT_ANGLE, HOME_FIT_ANGLE, 10, 26]) {
        const fill = subtendedHalfAngle(deg, view) / binding;
        assert.ok(
          fill > 0.999 && fill < 1.001,
          `cap ${deg} deg fills ${(fill * 100).toFixed(1)}% of the binding axis at `
          + `aspect ${aspect.toFixed(2)}, inset ${inset}; the fit should touch it exactly`,
        );
      }
    }
  }
});

test('the pre-fix formula violates that invariant, which is why it is a test', () => {
  // What fitDistance did before the dock reached it: the vertical half-angle
  // was the whole frustum, `atan(tan(fov/2) * min(1, aspect))`, regardless of
  // how much of the frame the dock was covering.
  const stale = (deg, { aspect, pad = FIT_PAD }) => {
    const a = (deg + pad) * DEG;
    const half = Math.atan(Math.tan((FOV * DEG) / 2) * Math.min(1, aspect));
    return Math.cos(a) + Math.sin(a) / Math.tan(half);
  };
  const aspect = 1440 / 783;      // the viewport the bug was measured on
  const visible = 1 - 0.625;      // dock 490px of a 783px stage
  const a = (FOCUS_FIT_ANGLE + FIT_PAD) * DEG;
  const d = stale(FOCUS_FIT_ANGLE, { aspect });
  const subtended = Math.atan(Math.sin(a) / (d - Math.cos(a)));

  assert.ok(
    subtended > visibleHalfAngle({ visible }),
    'the stale formula should overflow the band; if it does not, this test has stopped testing anything',
  );
  // And by how much: the country was drawn about twice the size that fits.
  const ratio = Math.tan(subtended) / Math.tan(visibleHalfAngle({ visible }));
  assert.ok(ratio > 1.9 && ratio < 2.9, `expected roughly 2x oversize, got ${ratio.toFixed(2)}x`);
});

test('a dock that covers more of the stage never pulls the camera closer', () => {
  // Non-decreasing, not strictly increasing: a portrait stage fits on its
  // horizontal axis, so until the dock has eaten enough height for the
  // vertical to become the binding axis, the distance is right not to move.
  for (const aspect of ASPECTS) {
    let previous = 0;
    for (const inset of INSETS) {
      const d = fitDistance(HOME_FIT_ANGLE, { aspect, visible: 1 - inset });
      assert.ok(d >= previous - 1e-12, `distance shrank as the dock grew, at aspect ${aspect}`);
      previous = d;
    }
  }
});

test('once the dock is the binding axis, the camera does pull back', () => {
  // The case the site actually shipped broken: a wide stage with the Explore
  // sheet open. Opening it has to change the framing, or the globe stays at
  // the size it was drawn for the whole canvas.
  const aspect = 1440 / 783;
  const closed = fitDistance(HOME_FIT_ANGLE, { aspect, visible: 1 });
  const open = fitDistance(HOME_FIT_ANGLE, { aspect, visible: 1 - 0.625 });
  assert.ok(open > closed * 1.5, `opening the sheet moved the camera from ${closed.toFixed(2)} to only ${open.toFixed(2)}`);
});

test('with no dock the fit is exactly what it was before the visible band existed', () => {
  for (const aspect of ASPECTS) {
    for (const deg of [FOCUS_FIT_ANGLE, HOME_FIT_ANGLE]) {
      const a = (deg + FIT_PAD) * DEG;
      const half = Math.atan(Math.tan((FOV * DEG) / 2) * Math.min(1, aspect));
      const before = Math.cos(a) + Math.sin(a) / Math.tan(half);
      assert.ok(
        Math.abs(fitDistance(deg, { aspect, visible: 1 }) - before) < 1e-12,
        `the visible-band generalisation changed the no-dock fit at aspect ${aspect}`,
      );
    }
  }
});

// -- Framing policy ---------------------------------------------------------

test('every country frames at the same angle, whatever its size', () => {
  // The defect: focusCountry fitted each country to its own bounds, so the
  // zoom on click was a function of country size. Colombia is 9.8 degrees from
  // Bogota and Chile 22.5 from Santiago, so clicking Colombia put the camera
  // more than twice as close, and neither left a neighbour on screen.
  const angles = new Set([1, 5, 9.8, 22.5, 27.9, 40.3, 90].map((r) => fitAngle(1, r)));
  assert.equal(angles.size, 1, 'single-country framing must not depend on the radius');
  assert.equal([...angles][0], FOCUS_FIT_ANGLE);
});

test('a concept spanning countries frames them all, capped at the home angle', () => {
  assert.equal(fitAngle(3, 18), 18);
  assert.equal(fitAngle(8, 90), HOME_FIT_ANGLE, 'US to Chile must not push the globe to a dot');
  assert.ok(fitAngle(2, 40) <= HOME_FIT_ANGLE);
});

test('the focus angle contains every country whole, except the declared exception', () => {
  const dictionary = json('api/v1/dictionary.json');
  const geometry = json('data/americas.json');
  // The US spans 40.3 degrees from Los Angeles. Framing it whole would need an
  // angle indistinguishable from the home view, and its Spanglish region is
  // the southwest, so it is allowed to overflow. Any other country that starts
  // failing here is a real regression: its neighbours have left the screen.
  const allowedToOverflow = new Set(['US']);

  const radius = (anchor, verts) => {
    let worst = 0;
    for (let i = 0; i < verts.length; i += 2) {
      const d = greatCircleDeg(anchor.lon, anchor.lat, verts[i], verts[i + 1]);
      if (d > worst) worst = d;
    }
    return worst;
  };

  for (const [code, country] of Object.entries(dictionary.countries)) {
    assert.ok(country.anchor, `${code} has no anchor; the globe, render.js and the geometry build all read it`);
    const rings = geometry.focus[code];
    assert.ok(rings, `${code} has no geometry; run \`make geometry\``);
    const r = radius(country.anchor, flatten(rings));
    if (allowedToOverflow.has(code)) continue;
    assert.ok(
      r <= FOCUS_FIT_ANGLE,
      `${code} is ${r.toFixed(1)} deg from ${country.anchor.label}, past the ${FOCUS_FIT_ANGLE} deg focus angle: `
      + 'either move the anchor, raise FOCUS_FIT_ANGLE, or add the code to allowedToOverflow with a reason',
    );
  }
});

// -- Bounds -----------------------------------------------------------------

test('the dock can never take the whole stage', () => {
  assert.equal(clampInset(10_000, 800), 800 * MAX_INSET_FRACTION);
  assert.equal(clampInset(-5, 800), 0);
  assert.equal(clampInset(undefined, 800), 0);
  for (const h of [200, 443, 783, 1200]) {
    const v = visibleFraction(h, 10_000);
    assert.ok(v >= 1 - MAX_INSET_FRACTION - 1e-12 && v <= 1, `visible fraction ${v} out of range`);
    assert.ok(v > 0, 'a zero visible fraction sends the fit distance to infinity');
  }
  assert.equal(visibleFraction(0, 100), 1, 'an unmeasured stage must not divide by zero');
});

test('the camera can always reach the distance a focus move asks for', () => {
  // setView clamps to controls.maxDistance. A focus fit landing past it is
  // silently truncated, which reads as the camera refusing to obey.
  for (const aspect of ASPECTS) {
    for (const inset of INSETS) {
      const view = { aspect, visible: 1 - inset, pad: fitPad(aspect * 800) };
      const wanted = fitDistance(FOCUS_FIT_ANGLE, view);
      const limit = maxCameraDistance(view);
      assert.ok(wanted <= limit, `focus fit ${wanted.toFixed(2)} exceeds maxDistance ${limit.toFixed(2)}`);
      assert.ok(wanted >= MIN_CAMERA_DISTANCE, `focus fit ${wanted.toFixed(2)} is inside minDistance`);
    }
  }
});

test('a portrait stage gets less padding than a wide one', () => {
  assert.equal(fitPad(NARROW_PX - 1), FIT_PAD_NARROW);
  assert.equal(fitPad(NARROW_PX), FIT_PAD);
  assert.equal(fitPad(1440), FIT_PAD);
});

// -- helpers ----------------------------------------------------------------

function greatCircleDeg(lon1, lat1, lon2, lat2) {
  const p1 = lat1 * DEG;
  const p2 = lat2 * DEG;
  const dl = (lon2 - lon1) * DEG;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}

/** The geometry ships nested rings of flat lon/lat pairs. */
function flatten(rings) {
  const out = [];
  const walk = (node) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number') out.push(...node);
    else node.forEach(walk);
  };
  walk(rings);
  return out;
}
