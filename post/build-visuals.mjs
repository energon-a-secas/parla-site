// ── Post diagrams ────────────────────────────────────────────
// Every number here is computed from the project's own data files. Nothing is
// typed in from the draft. If the dictionary or the geometry changes, rerun
// this and the diagrams follow; they cannot quietly disagree with the app.
//
//   node post/build-visuals.mjs && node post/rasterize.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frame, heading, footnote, emit, INK, DIM, MUTE, LINE, ACCENT, BG, esc } from './diagram-kit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(HERE, '..', p), 'utf8'));

const dict = read('api/v1/dictionary.json');
const geo = read('data/americas.json');

const DEG = Math.PI / 180;
const R_LAND = 1.006;    // js/globe3d.js R_FOCUS
const R_OCEAN = 1.0;     // js/globe3d.js R_OCEAN
const MAX_EDGE = 1.5;    // js/globe3d.js MAX_EDGE_FOCUS

const codes = Object.keys(dict.countries);
const meta = (c) => dict.countries[c];

// ── Model ────────────────────────────────────────────────────

/**
 * Where the retired globe put a country when you asked it to centre one.
 * It rotated about a single axis, so the request only ever aligned longitude;
 * the vertical position stayed at -sin(lat), in units of the globe radius.
 */
const oldVerticalOffset = (lat) => -Math.sin(lat * DEG);

const greatCircleDeg = (aLon, aLat, bLon, bLat) => {
  const p1 = aLat * DEG, p2 = bLat * DEG;
  const dp = (bLat - aLat) * DEG, dl = (bLon - aLon) * DEG;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / DEG;
};

/** Widest great-circle span of a country, straight from the shipped rings. */
function spanDeg(code) {
  const pts = [];
  for (const ring of geo.focus[code] || []) {
    for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
  }
  let max = 0;
  for (let i = 0; i < pts.length; i += 7) {
    for (let j = i + 7; j < pts.length; j += 7) {
      const d = greatCircleDeg(pts[i][0], pts[i][1], pts[j][0], pts[j][1]);
      if (d > max) max = d;
    }
  }
  return max;
}

/** How far from the sphere's centre a flat chord across `deg` actually sits. */
const chordMidpoint = (deg) => R_LAND * Math.cos((deg / 2) * DEG);

/** Concepts that carry at least one term for this country. */
function coverage(code) {
  let n = 0;
  for (const c of dict.concepts) {
    if (c.variants.some((v) => v.countries.includes(code))) n++;
  }
  return n;
}

const W = 1200, H = 760;

// ── 01 · What "centring" meant ───────────────────────────────
// One claim: the old focus aligned longitude and left latitude alone.

function centringSvg() {
  const cx = 720, cy = 442, r = 230;
  const rows = codes
    .map((c) => ({ c, ...meta(c), off: oldVerticalOffset(meta(c).anchor.lat) }))
    .sort((a, b) => a.off - b.off);

  const mx = rows.find((x) => x.c === 'MX');
  const ar = rows.find((x) => x.c === 'AR');
  const spread = Math.abs(ar.off - mx.off);

  // Dots stay at their true offsets; only the labels are spread apart, with a
  // leader from each dot to its own row. Moving a dot would falsify the chart.
  const MIN_GAP = 34;
  const labelY = [];
  rows.forEach(({ off }, i) => {
    let y = cy + off * r;
    if (i > 0 && y - labelY[i - 1] < MIN_GAP) y = labelY[i - 1] + MIN_GAP;
    labelY.push(y);
  });

  const dots = rows.map(({ color, anchor, off }, i) => {
    const y = cy + off * r;
    const ly = labelY[i];
    return `
    <path d="M${cx + 14} ${y.toFixed(1)} L${cx + r - 6} ${y.toFixed(1)} L${cx + r + 26} ${ly.toFixed(1)} L${cx + r + 34} ${ly.toFixed(1)}"
          fill="none" stroke="${color}" stroke-opacity=".3" stroke-dasharray="5 5"/>
    <path d="M${cx - 14} ${y.toFixed(1)} L${cx - r + 6} ${y.toFixed(1)} L${cx - r - 26} ${ly.toFixed(1)} L${cx - r - 34} ${ly.toFixed(1)}"
          fill="none" stroke="${color}" stroke-opacity=".3" stroke-dasharray="5 5"/>
    <circle cx="${cx}" cy="${y.toFixed(1)}" r="9" fill="${color}"/>
    <text x="${cx + r + 44}" y="${(ly + 7).toFixed(1)}" fill="${INK}" font-size="20" font-weight="600">${esc(anchor.label)}</text>
    <text x="${cx - r - 44}" y="${(ly + 7).toFixed(1)}" text-anchor="end" fill="${DIM}" font-size="20" font-weight="700">${(Math.abs(off) * 100).toFixed(0)}%</text>`;
  }).join('');

  const yTop = cy + mx.off * r, yBot = cy + ar.off * r;   // true dot positions

  return frame(W, H, `
  ${heading(64, 92, 'before', 'Every one of these is "centred"', 'One axis of rotation only, so focusing a country aligned its longitude and left latitude where it fell')}

  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${LINE}"/>
  <line x1="${cx - r - 26}" y1="${cy}" x2="${cx + r + 26}" y2="${cy}" stroke="${INK}" stroke-opacity=".55" stroke-width="2"/>
  <text x="${cx - 30}" y="${cy + 30}" text-anchor="end" fill="${INK}" font-size="17" font-weight="600" fill-opacity=".75">centre of the view</text>
  ${dots}

  <line x1="${cx - r - 152}" y1="${yTop.toFixed(1)}" x2="${cx - r - 152}" y2="${yBot.toFixed(1)}" stroke="${ACCENT}" stroke-width="3"/>
  <text x="${cx - r - 168}" y="${((yTop + yBot) / 2 - 8).toFixed(1)}" text-anchor="end" fill="${ACCENT}" font-size="30" font-weight="700">${(spread * 100).toFixed(0)}%</text>
  <text x="${cx - r - 168}" y="${((yTop + yBot) / 2 + 20).toFixed(1)}" text-anchor="end" fill="${MUTE}" font-size="18">of the radius apart</text>

  ${footnote(64, H - 44, `Vertical offset = -sin(latitude), in units of the globe radius. Capitals from api/v1/dictionary.json.`)}`);
}

// ── 02 · Flat triangles sink ─────────────────────────────────
// Draw the wall: the ocean surface is the line the fills fail to reach.

function sagSvg() {
  const rows = codes
    .map((c) => {
      const span = spanDeg(c);
      return { c, ...meta(c), span, mid: chordMidpoint(span) };
    })
    .sort((a, b) => a.mid - b.mid);

  // Scale the interesting band only: everything lives between 0.93 and 1.01.
  const lo = 0.93, hi = 1.012;
  const x0 = 300, x1 = 1040;
  const px = (v) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  const oceanX = px(R_OCEAN), landX = px(R_LAND);

  const barH = 38, gap = 17;
  const top = 250;

  const bars = rows.map((row, i) => {
    const y = top + i * (barH + gap);
    const w = px(row.mid) - x0;
    const short = R_OCEAN - row.mid;
    // Two decimals when a country only just fails, so the smallest gap does not
    // round to "0.0% short" and read as if it cleared.
    const pct = short * 100 < 0.1 ? (short * 100).toFixed(2) : (short * 100).toFixed(1);
    // Labels that would run past the ocean wall go inside the bar instead.
    const inside = px(row.mid) + 130 > oceanX;
    return `
    <text x="${x0 - 28}" y="${y + barH * 0.7}" text-anchor="end" fill="${INK}" font-size="21" font-weight="600">${esc(row.name)}</text>
    <rect x="${x0}" y="${y}" width="${(landX - x0).toFixed(1)}" height="${barH}" rx="6" fill="rgba(255,255,255,.05)"/>
    <rect x="${x0}" y="${y}" width="${w.toFixed(1)}" height="${barH}" rx="6" fill="${row.color}" fill-opacity=".9"/>
    <text x="${(inside ? px(row.mid) - 14 : px(row.mid) + 14).toFixed(1)}" y="${y + barH * 0.7}"
          text-anchor="${inside ? 'end' : 'start'}" fill="${inside ? BG : row.color}" font-size="19" font-weight="700">${pct}% short</text>
    <text x="${x1 + 118}" y="${y + barH * 0.7}" text-anchor="end" fill="${MUTE}" font-size="18">${row.span.toFixed(0)}° wide</text>`;
  }).join('');

  const bottom = top + rows.length * (barH + gap);

  return frame(W, H, `
  ${heading(64, 92, 'the wall', 'A flat triangle cuts through the sphere', 'Where the middle of a chord across each country actually sits, against the ocean surface it has to clear')}

  <rect x="${(oceanX - 2).toFixed(1)}" y="${top - 26}" width="4" height="${bottom - top + 18}" fill="${INK}"/>
  <text x="${oceanX + 12}" y="${top - 36}" fill="${INK}" font-size="19" font-weight="700">ocean surface</text>
  <line x1="${landX}" y1="${top - 12}" x2="${landX}" y2="${bottom + 4}" stroke="${MUTE}" stroke-dasharray="4 5"/>
  <text x="${landX + 10}" y="${bottom + 34}" fill="${MUTE}" font-size="17">land radius</text>

  ${bars}

  <text x="64" y="${bottom + 62}" fill="${MUTE}" font-size="19">Everything left of the white line is inside the sphere, where the ocean would cover it.</text>
  ${footnote(64, H - 44, `Spans measured from data/americas.json. Subdividing to ${MAX_EDGE}° edges leaves a sag of ${((R_LAND - chordMidpoint(MAX_EDGE))).toExponential(1)} of the radius.`)}`);
}

// ── 03 · Coverage ────────────────────────────────────────────

function coverageSvg() {
  const total = dict.concepts.length;
  const rows = codes
    .map((c) => ({ c, ...meta(c), n: coverage(c) }))
    .sort((a, b) => b.n - a.n);

  const x0 = 330, w = 640, barH = 38, gap = 15, top = 236;

  const bars = rows.map((row, i) => {
    const y = top + i * (barH + gap);
    const bw = (row.n / total) * w;
    const isNew = row.c === 'US';
    return `
    <text x="${x0 - 28}" y="${y + barH * 0.7}" text-anchor="end" fill="${INK}" font-size="21" font-weight="600">${esc(row.name)}${row.variety ? ` <tspan fill="${MUTE}" font-size="17">${esc(row.variety)}</tspan>` : ''}</text>
    <rect x="${x0}" y="${y}" width="${w}" height="${barH}" rx="7" fill="rgba(255,255,255,.05)"/>
    <rect x="${x0}" y="${y}" width="${bw.toFixed(1)}" height="${barH}" rx="7" fill="${row.color}" fill-opacity="${isNew ? '.95' : '.75'}"/>
    ${isNew ? `<rect x="${x0}" y="${y}" width="${bw.toFixed(1)}" height="${barH}" rx="7" fill="none" stroke="${row.color}" stroke-width="2"/>` : ''}
    <text x="${x0 + w + 26}" y="${y + barH * 0.7}" fill="${isNew ? row.color : DIM}" font-size="22" font-weight="700">${row.n}</text>`;
  }).join('');

  return frame(W, H, `
  ${heading(64, 92, 'content', `${total} concepts, ${codes.length} countries`, 'Concepts with at least one term for each country. The eighth is a dialect, not a nation')}
  ${bars}
  ${footnote(64, H - 44, `Counted from api/v1/dictionary.json v${dict.version}. Spanglish shares most of its slang with Mexico, plus terms that exist nowhere else.`)}`);
}

emit({
  '01-centring.svg': centringSvg(),
  '02-sag.svg': sagSvg(),
  '03-coverage.svg': coverageSvg(),
}, HERE, { writeFileSync, join });
