// -- Background: zoomed-in topographic map --
// Procedural canvas drawing that looks like a close-up of a map with
// contour lines, grid coordinates, elevation markers, and subtle terrain.

import { $ } from './utils.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Simple 2D noise approximation using sine interference
function noiseAt(x, y, seed) {
  return (
    Math.sin(x * 0.012 + seed) * Math.cos(y * 0.009 + seed * 0.7) +
    Math.sin(x * 0.007 - y * 0.005 + seed * 1.3) * 0.6 +
    Math.cos(x * 0.003 + y * 0.011 + seed * 2.1) * 0.4
  ) / 2;
}

export function initBackground() {
  const container = $('bgShapes');
  if (!container) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'bg-canvas';
  container.appendChild(canvas);

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const accent = '#c084fc';
    const rng = mulberry32(42);

    // ── Grid lines (latitude/longitude) ──────────────────────────
    const gridSpacing = Math.max(80, Math.min(w, h) * 0.08);
    ctx.lineWidth = 0.5;

    // Horizontal grid lines
    for (let y = gridSpacing; y < h; y += gridSpacing) {
      const wobble = Math.sin(y * 0.01) * 2;
      ctx.beginPath();
      ctx.moveTo(0, y + wobble);
      ctx.lineTo(w, y + wobble);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.04;
      ctx.stroke();
    }

    // Vertical grid lines
    for (let x = gridSpacing; x < w; x += gridSpacing) {
      const wobble = Math.cos(x * 0.01) * 2;
      ctx.beginPath();
      ctx.moveTo(x + wobble, 0);
      ctx.lineTo(x + wobble, h);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.04;
      ctx.stroke();
    }

    // ── Coordinate labels at intersections ───────────────────────
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let y = gridSpacing; y < h; y += gridSpacing) {
      for (let x = gridSpacing; x < w; x += gridSpacing) {
        if (rng() > 0.4) continue;
        const lat = (33.4 + (y / h) * 2).toFixed(1);
        const lng = (70.6 + (x / w) * 1.5).toFixed(1);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.06;
        ctx.fillText(`${lat}S ${lng}W`, x + 4, y + 3);
      }
    }

    // ── Topographic contour lines ────────────────────────────────
    // Draw iso-lines of the noise function at regular thresholds
    const seed = 7.3;
    const step = 6;
    const thresholds = [-0.6, -0.3, 0, 0.3, 0.6];

    for (const threshold of thresholds) {
      const opacity = threshold === 0 ? 0.09 : 0.05;
      const lineW = threshold === 0 ? 1.0 : 0.7;
      ctx.strokeStyle = accent;
      ctx.globalAlpha = opacity;
      ctx.lineWidth = lineW;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // March horizontally, find where noise crosses threshold
      for (let y = 0; y < h; y += step) {
        ctx.beginPath();
        let drawing = false;
        let prevAbove = noiseAt(0, y, seed) > threshold;

        for (let x = 0; x <= w; x += 3) {
          const val = noiseAt(x, y, seed);
          const above = val > threshold;

          // Near the contour line: draw a segment
          if (Math.abs(val - threshold) < 0.08) {
            if (!drawing) { ctx.moveTo(x, y); drawing = true; }
            else ctx.lineTo(x, y);
          } else {
            if (drawing) { ctx.stroke(); ctx.beginPath(); drawing = false; }
          }
          prevAbove = above;
        }
        if (drawing) ctx.stroke();
      }
    }

    // ── Elevation markers (small triangles at peaks) ─────────────
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = accent;
    const markerRng = mulberry32(123);
    for (let i = 0; i < 15; i++) {
      const mx = markerRng() * w;
      const my = markerRng() * h;
      const val = noiseAt(mx, my, seed);
      if (val > 0.35) {
        const sz = 4;
        ctx.beginPath();
        ctx.moveTo(mx, my - sz);
        ctx.lineTo(mx - sz * 0.7, my + sz * 0.5);
        ctx.lineTo(mx + sz * 0.7, my + sz * 0.5);
        ctx.closePath();
        ctx.fill();

        ctx.font = '8px monospace';
        ctx.globalAlpha = 0.05;
        ctx.textAlign = 'left';
        ctx.fillText(Math.round(val * 2400 + 800) + 'm', mx + 6, my);
        ctx.globalAlpha = 0.07;
      }
    }

    // ── Dashed path lines (like trails/roads) ────────────────────
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.06;

    const pathRng = mulberry32(77);
    for (let p = 0; p < 4; p++) {
      ctx.beginPath();
      let px = pathRng() * w;
      let py = pathRng() * h;
      ctx.moveTo(px, py);
      const segments = 15 + Math.floor(pathRng() * 20);
      for (let s = 0; s < segments; s++) {
        // Follow gentle curves
        const angle = pathRng() * Math.PI * 2;
        const len = 30 + pathRng() * 60;
        px += Math.cos(angle) * len;
        py += Math.sin(angle) * len * 0.4;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // ── Scattered dot markers (settlements/points of interest) ───
    const dotRng = mulberry32(999);
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = accent;
    for (let i = 0; i < 30; i++) {
      const dx = dotRng() * w;
      const dy = dotRng() * h;
      ctx.beginPath();
      ctx.arc(dx, dy, 2, 0, Math.PI * 2);
      ctx.fill();
      // Small ring around some
      if (dotRng() > 0.6) {
        ctx.beginPath();
        ctx.arc(dx, dy, 5, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.04;
        ctx.stroke();
        ctx.globalAlpha = 0.06;
      }
    }

    // ── Subtle area shading using noise ──────────────────────────
    ctx.globalAlpha = 1;
    const imgData = ctx.getImageData(0, 0, w * dpr, h * dpr);
    const data = imgData.data;
    const shadeSeed = 3.7;
    for (let py = 0; py < h * dpr; py += 4) {
      for (let px = 0; px < w * dpr; px += 4) {
        const nx = px / dpr;
        const ny = py / dpr;
        const val = noiseAt(nx, ny, shadeSeed);
        if (val > 0.2) {
          const idx = (py * w * dpr + px) * 4;
          const strength = (val - 0.2) * 8;
          // Tint toward accent purple
          data[idx] = Math.min(255, data[idx] + strength * 0.75);
          data[idx + 1] = Math.min(255, data[idx + 1] + strength * 0.5);
          data[idx + 2] = Math.min(255, data[idx + 2] + strength);
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    ctx.globalAlpha = 1;
  }

  draw();
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(draw, 200);
  });
}
