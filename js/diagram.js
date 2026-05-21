// -- Background: geographic Latin America map --
// Country outlines from Natural Earth (110m), dot fill, city markers,
// mouse parallax, and subtle ambient motion.

import { $ } from './utils.js';

const ACCENT = '#c084fc';
const ACCENT_RGB = { r: 192, g: 132, b: 252 };

const APP_COUNTRY_COLOR = {
  MX: '#22c55e',
  CO: '#eab308',
  AR: '#38bdf8',
  PE: '#f97316',
  VE: '#a855f7',
  CL: '#dc2626',
};

/** @type {{ bounds: object, countries: Array, cities: Array } | null} */
let geo = null;
/** @type {{ x: number, y: number }[]} */
let landDots = [];

export function initBackground() {
  const container = $('bgShapes');
  if (!container) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'bg-canvas';
  container.appendChild(canvas);

  let w = window.innerWidth;
  let h = window.innerHeight;
  let dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');

  let mouseX = w / 2;
  let mouseY = h / 2;
  let targetMouseX = mouseX;
  let targetMouseY = mouseY;

  fetch('data/latam-outline.json')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      geo = data;
      rebuildLandDots();
    })
    .catch(() => {});

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

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    rebuildLandDots();
  }

  function getScreenBounds() {
    const padding = 0.08;
    const mapW = w * (1 - padding * 2);
    const mapH = h * (1 - padding * 2);
    const offsetX = w * padding;
    const offsetY = h * padding;
    return { mapW, mapH, offsetX, offsetY };
  }

  function project(lon, lat, screen) {
    if (!geo?.bounds) return { x: 0, y: 0 };
    const { minLon, maxLon, minLat, maxLat } = geo.bounds;
    const nx = (lon - minLon) / (maxLon - minLon);
    const ny = (maxLat - lat) / (maxLat - minLat);
    return {
      x: screen.offsetX + nx * screen.mapW,
      y: screen.offsetY + ny * screen.mapH,
    };
  }

  function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].lon;
      const yi = ring[i].lat;
      const xj = ring[j].lon;
      const yj = ring[j].lat;
      const intersect = ((yi > lat) !== (yj > lat))
        && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointOnLand(lon, lat) {
    if (!geo?.countries) return false;
    return geo.countries.some((c) => pointInRing(lon, lat, c.ring));
  }

  function rebuildLandDots() {
    landDots = [];
    if (!geo?.bounds) return;

    const screen = getScreenBounds();
    const step = Math.max(10, Math.min(16, Math.floor(Math.min(screen.mapW, screen.mapH) / 80)));
    const { minLon, maxLon, minLat, maxLat } = geo.bounds;

    for (let py = screen.offsetY; py < screen.offsetY + screen.mapH; py += step) {
      for (let px = screen.offsetX; px < screen.offsetX + screen.mapW; px += step) {
        const nx = (px - screen.offsetX) / screen.mapW;
        const ny = (py - screen.offsetY) / screen.mapH;
        const lon = minLon + nx * (maxLon - minLon);
        const lat = maxLat - ny * (maxLat - minLat);
        if (pointOnLand(lon, lat)) {
          landDots.push({ x: px, y: py });
        }
      }
    }
  }

  function drawGrid(parallaxX, parallaxY) {
    const gridSpacing = Math.max(100, Math.min(w, h) * 0.1);

    ctx.save();
    ctx.translate(parallaxX * 0.3, parallaxY * 0.3);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.02;

    for (let y = gridSpacing; y < h + 50; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(-50, y);
      ctx.lineTo(w + 50, y);
      ctx.stroke();
    }

    for (let x = gridSpacing; x < w + 50; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, -50);
      ctx.lineTo(x, h + 50);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawLandDots(parallaxX, parallaxY) {
    if (!landDots.length) return;

    ctx.save();
    ctx.translate(parallaxX, parallaxY);
    ctx.fillStyle = ACCENT;

    for (const p of landDots) {
      ctx.globalAlpha = 0.055 + (p.x % 3) * 0.008;
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    }

    ctx.restore();
  }

  function drawCountries(parallaxX, parallaxY) {
    if (!geo?.countries) return;

    const screen = getScreenBounds();

    ctx.save();
    ctx.translate(parallaxX, parallaxY);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (const country of geo.countries) {
      const { ring, color } = country;

      ctx.beginPath();
      ring.forEach((pt, i) => {
        const { x, y } = project(pt.lon, pt.lat, screen);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();

      ctx.fillStyle = color || ACCENT;
      ctx.globalAlpha = 0.04;
      ctx.fill();

      ctx.strokeStyle = color || ACCENT;
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawCityMarkers(timestamp, parallaxX, parallaxY) {
    if (!geo?.cities) return;

    const screen = getScreenBounds();

    ctx.save();
    ctx.translate(parallaxX, parallaxY);

    geo.cities.forEach((city, i) => {
      const { x, y } = project(city.lon, city.lat, screen);
      const cityColor = APP_COUNTRY_COLOR[city.country] || ACCENT;
      const pulse = 0.14 + Math.sin(timestamp * 0.002 + i * 1.2) * 0.06;
      const ringPulse = 0.07 + Math.sin(timestamp * 0.0015 + i * 1.2) * 0.03;

      ctx.beginPath();
      ctx.arc(x, y, 9 + Math.sin(timestamp * 0.002 + i) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = cityColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = ringPulse;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = cityColor;
      ctx.globalAlpha = pulse;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.globalAlpha = pulse + 0.1;
      ctx.fill();
    });

    ctx.restore();
  }

  function drawCursorGlow() {
    const radius = 180;
    const gradient = ctx.createRadialGradient(
      mouseX, mouseY, 0,
      mouseX, mouseY, radius,
    );
    gradient.addColorStop(0, `rgba(${ACCENT_RGB.r}, ${ACCENT_RGB.g}, ${ACCENT_RGB.b}, 0.04)`);
    gradient.addColorStop(0.5, `rgba(${ACCENT_RGB.r}, ${ACCENT_RGB.g}, ${ACCENT_RGB.b}, 0.015)`);
    gradient.addColorStop(1, 'transparent');

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.fillRect(mouseX - radius, mouseY - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  function draw(timestamp) {
    updateMouse();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const driftX = Math.sin(timestamp * 0.00008) * 15;
    const driftY = Math.cos(timestamp * 0.00006) * 10;
    const parallaxX = (mouseX - w / 2) * -0.015 + driftX;
    const parallaxY = (mouseY - h / 2) * -0.015 + driftY;

    drawGrid(parallaxX, parallaxY);
    drawLandDots(parallaxX, parallaxY);
    drawCountries(parallaxX, parallaxY);
    drawCityMarkers(timestamp, parallaxX, parallaxY);
    drawCursorGlow();

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
