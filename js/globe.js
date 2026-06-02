// -- 2D orthographic globe (background) --
// Natural Earth land outlines, seven capital pins, hover cards from dictionary.

import { $, escHtml } from './utils.js';

const ACCENT = '#c084fc';
const ACCENT_RGB = { r: 192, g: 132, b: 252 };
const CAPITAL_CODES = ['MX', 'CO', 'VE', 'BR', 'PE', 'CL', 'AR'];

const ISO3_TO_COUNTRY = {
  MEX: 'MX',
  COL: 'CO',
  VEN: 'VE',
  BRA: 'BR',
  PER: 'PE',
  CHL: 'CL',
  ARG: 'AR',
};
const SAMPLE_COUNT = 5;
const DEFAULT_FOCUS_LON = -78;
const FOCUS_LERP = 0.08;

const DEG = Math.PI / 180;

let applyGlobeFocus = null;

export function focusGlobeCountry(countryCode) {
  applyGlobeFocus?.(countryCode);
}

export function focusGlobeForSelection({ country, variant, concept }) {
  let code = country || null;
  if (!code && variant?.countries?.length) {
    code = CAPITAL_CODES.find((c) => variant.countries.includes(c)) || variant.countries[0];
  } else if (!code && concept?.variants?.[0]?.countries?.length) {
    const cs = concept.variants[0].countries;
    code = CAPITAL_CODES.find((c) => cs.includes(c)) || cs[0];
  }
  focusGlobeCountry(code);
}

function lonLatToXYZ(lon, lat) {
  const lo = lon * DEG;
  const la = lat * DEG;
  const cl = Math.cos(la);
  return {
    x: cl * Math.cos(lo),
    y: Math.sin(la),
    z: cl * Math.sin(lo),
  };
}

function rotateY(p, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    x: p.x * c + p.z * s,
    y: p.y,
    z: -p.x * s + p.z * c,
  };
}

function projectSphere(p, cx, cy, radius) {
  return {
    x: cx - p.x * radius,
    y: cy - p.y * radius,
    z: p.z,
    visible: p.z > 0.02,
  };
}

function longitudeToSpinAngle(lon) {
  const lo = lon * DEG;
  const x = Math.cos(lo);
  const z = Math.sin(lo);
  return Math.atan2(-x, z);
}

function normalizeAngle(a) {
  let angle = a;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function lerpAngle(current, target, t) {
  const diff = normalizeAngle(target - current);
  return current + diff * t;
}

function shufflePick(items, count) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function buildSamplesByCountry(dict) {
  const buckets = Object.fromEntries(CAPITAL_CODES.map((c) => [c, []]));
  if (!dict?.concepts) return buckets;

  for (const concept of dict.concepts) {
    for (const variant of concept.variants) {
      for (const code of variant.countries) {
        if (!buckets[code]) continue;
        buckets[code].push({
          term: variant.term,
          meaning: concept.meaning_en,
        });
      }
    }
  }
  return buckets;
}

export function initBackground(dictionary) {
  const container = $('bgShapes');
  if (!container) return;

  const capitalsLayer = $('globeCapitals') || (() => {
    const el = document.createElement('div');
    el.id = 'globeCapitals';
    el.className = 'globe-capitals';
    el.setAttribute('aria-hidden', 'true');
    container.appendChild(el);
    return el;
  })();

  const cardEl = $('globeCard') || (() => {
    const el = document.createElement('div');
    el.id = 'globeCard';
    el.className = 'globe-card hidden';
    el.setAttribute('role', 'tooltip');
    container.appendChild(el);
    return el;
  })();

  const canvas = document.createElement('canvas');
  canvas.className = 'bg-canvas';
  container.insertBefore(canvas, container.firstChild);

  const samplesByCountry = buildSamplesByCountry(dictionary);
  const countriesMeta = dictionary?.countries || {};

  let geo = null;
  let landVerts = [];
  let borderRings = [];
  let capitals = [];
  let spinAngle = longitudeToSpinAngle(DEFAULT_FOCUS_LON);
  let targetSpinAngle = spinAngle;
  let stickyFocusCountry = null;
  const motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resolveFocusLon(code) {
    if (!code) return DEFAULT_FOCUS_LON;
    const city = capitals.find((c) => c.country === code);
    if (city) return city.lon;
    return DEFAULT_FOCUS_LON;
  }

  function aimGlobeAt(countryCode) {
    targetSpinAngle = longitudeToSpinAngle(resolveFocusLon(countryCode));
    if (!motionOk) spinAngle = targetSpinAngle;
  }

  function setGlobeFocusTarget(countryCode) {
    stickyFocusCountry = countryCode;
    aimGlobeAt(countryCode);
  }

  applyGlobeFocus = setGlobeFocusTarget;
  setGlobeFocusTarget(null);

  const pins = CAPITAL_CODES.map((code) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'globe-capital-pin hidden';
    btn.dataset.country = code;
    const meta = countriesMeta[code];
    btn.setAttribute('aria-label', meta ? `${meta.name}, ver ejemplos de jerga` : code);
    btn.innerHTML = `<span class="globe-pin-dot" style="--pin-color:${meta?.color || ACCENT}"></span>`;
    capitalsLayer.appendChild(btn);
    return btn;
  });

  let activePin = null;
  let hideCardTimer = null;

  function showCard(code, screenX, screenY) {
    const meta = countriesMeta[code];
    const samples = shufflePick(samplesByCountry[code] || [], SAMPLE_COUNT);
    if (!meta || !samples.length) return;

    const termsHtml = samples.map((s) =>
      `<li><span class="globe-card-term">${escHtml(s.term)}</span><span class="globe-card-meaning">${escHtml(s.meaning)}</span></li>`,
    ).join('');

    cardEl.innerHTML = `
      <div class="globe-card-head">${meta.flag} ${escHtml(meta.name)}</div>
      <ul class="globe-card-terms">${termsHtml}</ul>
    `;
    cardEl.classList.remove('hidden');

    requestAnimationFrame(() => {
      const pad = 12;
      const rect = cardEl.getBoundingClientRect();
      let left = screenX + 16;
      let top = screenY - rect.height / 2;
      left = Math.min(left, window.innerWidth - rect.width - pad);
      left = Math.max(pad, left);
      top = Math.min(top, window.innerHeight - rect.height - pad);
      top = Math.max(pad, top);
      cardEl.style.left = `${left}px`;
      cardEl.style.top = `${top}px`;
    });
  }

  function hideCard() {
    cardEl.classList.add('hidden');
    activePin = null;
  }

  pins.forEach((pin) => {
    pin.addEventListener('mouseenter', () => {
      aimGlobeAt(pin.dataset.country);
      clearTimeout(hideCardTimer);
      activePin = pin;
      const x = parseFloat(pin.style.left) + 12;
      const y = parseFloat(pin.style.top) + 12;
      showCard(pin.dataset.country, x, y);
    });
    pin.addEventListener('focus', () => {
      aimGlobeAt(pin.dataset.country);
      clearTimeout(hideCardTimer);
      activePin = pin;
      const x = parseFloat(pin.style.left) + 12;
      const y = parseFloat(pin.style.top) + 12;
      showCard(pin.dataset.country, x, y);
    });
    pin.addEventListener('mouseleave', () => {
      hideCardTimer = setTimeout(() => {
        hideCard();
        aimGlobeAt(stickyFocusCountry);
      }, 180);
    });
    pin.addEventListener('blur', () => {
      hideCardTimer = setTimeout(() => {
        hideCard();
        aimGlobeAt(stickyFocusCountry);
      }, 180);
    });
    pin.addEventListener('click', (e) => {
      e.preventDefault();
      setGlobeFocusTarget(pin.dataset.country);
    });
  });

  cardEl.addEventListener('mouseenter', () => clearTimeout(hideCardTimer));
  cardEl.addEventListener('mouseleave', () => {
    hideCardTimer = setTimeout(hideCard, 120);
  });

  fetch('data/latam-outline.json')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      geo = data;
      rebuildMeshes();
      capitals = (geo.cities || []).filter((c) => CAPITAL_CODES.includes(c.country));
      setGlobeFocusTarget(null);
    })
    .catch(() => {});

  function rebuildMeshes() {
    landVerts = [];
    borderRings = [];
    if (!geo?.countries) return;

    for (const country of geo.countries) {
      const appCode = ISO3_TO_COUNTRY[country.code];
      const fill =
        (appCode && countriesMeta[appCode]?.color) || country.color;
      const step = Math.max(1, Math.floor(country.ring.length / 80));
      const ring3d = [];
      for (let i = 0; i < country.ring.length; i += step) {
        const pt = country.ring[i];
        const v = lonLatToXYZ(pt.lon, pt.lat);
        landVerts.push({ ...v, color: fill });
        ring3d.push(v);
      }
      if (ring3d.length > 2) borderRings.push({ color: fill, points: ring3d });
    }
  }

  let w = window.innerWidth;
  let h = window.innerHeight;
  let dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');

  let mouseX = w / 2;
  let mouseY = h / 2;
  let targetMouseX = mouseX;
  let targetMouseY = mouseY;

  function updateMouse() {
    mouseX += (targetMouseX - mouseX) * 0.08;
    mouseY += (targetMouseY - mouseY) * 0.08;
  }

  window.addEventListener('mousemove', (e) => {
    targetMouseX = e.clientX;
    targetMouseY = e.clientY;
  });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      targetMouseX = e.touches[0].clientX;
      targetMouseY = e.touches[0].clientY;
    }
  }, { passive: true });

  function globeLayout() {
    const size = Math.min(w, h);
    const radius = size * 0.44;
    const cx = w * 0.5;
    const cy = h * 0.46;
    return { cx, cy, radius };
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  function drawGraticule(cx, cy, radius, angle) {
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 0.5;

    for (let lat = -60; lat <= 60; lat += 15) {
      ctx.beginPath();
      let started = false;
      for (let lon = -180; lon <= 180; lon += 4) {
        const p = rotateY(lonLatToXYZ(lon, lat), angle);
        const s = projectSphere(p, cx, cy, radius);
        if (!s.visible) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(s.x, s.y);
          started = true;
        } else {
          ctx.lineTo(s.x, s.y);
        }
      }
      ctx.globalAlpha = 0.025;
      ctx.stroke();
    }

    for (let lon = -180; lon < 180; lon += 15) {
      ctx.beginPath();
      let started = false;
      for (let lat = -80; lat <= 80; lat += 4) {
        const p = rotateY(lonLatToXYZ(lon, lat), angle);
        const s = projectSphere(p, cx, cy, radius);
        if (!s.visible) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(s.x, s.y);
          started = true;
        } else {
          ctx.lineTo(s.x, s.y);
        }
      }
      ctx.globalAlpha = 0.02;
      ctx.stroke();
    }
  }

  function drawAtmosphere(cx, cy, radius) {
    const g = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.08);
    g.addColorStop(0, `rgba(${ACCENT_RGB.r}, ${ACCENT_RGB.g}, ${ACCENT_RGB.b}, 0.07)`);
    g.addColorStop(0.7, `rgba(${ACCENT_RGB.r}, ${ACCENT_RGB.g}, ${ACCENT_RGB.b}, 0.02)`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.08, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLand(cx, cy, radius, angle) {
    for (const v of landVerts) {
      const p = rotateY(v, angle);
      const s = projectSphere(p, cx, cy, radius);
      if (!s.visible) continue;
      const depth = (s.z + 1) * 0.5;
      ctx.fillStyle = v.color || ACCENT;
      ctx.globalAlpha = 0.04 + depth * 0.07;
      ctx.fillRect(s.x, s.y, 1.6, 1.6);
    }
  }

  function drawBorders(cx, cy, radius, angle) {
    for (const ring of borderRings) {
      ctx.strokeStyle = ring.color || ACCENT;
      ctx.lineWidth = 0.85;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (const v of ring.points) {
        const p = rotateY(v, angle);
        const s = projectSphere(p, cx, cy, radius);
        if (!s.visible) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(s.x, s.y);
          started = true;
        } else {
          ctx.lineTo(s.x, s.y);
        }
      }
      ctx.globalAlpha = 0.16;
      ctx.stroke();
    }
  }

  function drawGlobeRim(cx, cy, radius) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = ACCENT;
    ctx.globalAlpha = 0.08;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function updateCapitalPins(cx, cy, radius, angle) {
    if (!capitals.length) return;

    capitals.forEach((city, i) => {
      const pin = pins.find((p) => p.dataset.country === city.country);
      if (!pin) return;

      const p = rotateY(lonLatToXYZ(city.lon, city.lat), angle);
      const s = projectSphere(p, cx, cy, radius);

      if (!s.visible) {
        pin.classList.add('hidden');
        return;
      }

      pin.classList.remove('hidden');
      const size = 24;
      pin.style.left = `${s.x - size / 2}px`;
      pin.style.top = `${s.y - size / 2}px`;
      pin.style.opacity = String(0.55 + s.z * 0.45);

      if (activePin === pin && !cardEl.classList.contains('hidden')) {
        showCard(city.country, s.x + size / 2, s.y + size / 2);
      }
    });
  }

  function drawCursorGlow() {
    const radius = 160;
    const gradient = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, radius);
    gradient.addColorStop(0, `rgba(${ACCENT_RGB.r}, ${ACCENT_RGB.g}, ${ACCENT_RGB.b}, 0.035)`);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 1;
    ctx.fillRect(mouseX - radius, mouseY - radius, radius * 2, radius * 2);
  }

  let lastFrame = 0;

  function draw(timestamp) {
    updateMouse();
    const dt = lastFrame ? timestamp - lastFrame : 16;
    lastFrame = timestamp;
    if (motionOk) {
      spinAngle = lerpAngle(spinAngle, targetSpinAngle, FOCUS_LERP * (dt / 16));
    } else {
      spinAngle = targetSpinAngle;
    }

    const { cx, cy, radius } = globeLayout();
    const parallaxX = (mouseX - w / 2) * -0.008;
    const parallaxY = (mouseY - h / 2) * -0.008;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(parallaxX, parallaxY);

    drawAtmosphere(cx, cy, radius);
    drawGraticule(cx, cy, radius, spinAngle);
    drawLand(cx, cy, radius, spinAngle);
    drawBorders(cx, cy, radius, spinAngle);
    drawGlobeRim(cx, cy, radius);

    ctx.restore();
    drawCursorGlow();
    updateCapitalPins(cx + parallaxX, cy + parallaxY, radius, spinAngle);

    requestAnimationFrame(draw);
  }

  resize();
  requestAnimationFrame(draw);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 100);
  });
}
