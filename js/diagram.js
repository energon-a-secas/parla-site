// -- Background: Latin America silhouette map --
// Minimal animated canvas with continent outline, city markers,
// mouse parallax, and subtle ambient motion.

import { $ } from './utils.js';

// Simplified Latin America coastline (normalized 0-1 coordinates)
// Positioned to center the continent with some padding
const LATAM_PATH = [
  // Mexico - northwest
  { x: 0.28, y: 0.06 },
  { x: 0.22, y: 0.08 },
  { x: 0.18, y: 0.12 },
  { x: 0.20, y: 0.16 },
  { x: 0.26, y: 0.18 },
  // Yucatan bump
  { x: 0.32, y: 0.16 },
  { x: 0.34, y: 0.18 },
  // Central America
  { x: 0.30, y: 0.22 },
  { x: 0.28, y: 0.26 },
  { x: 0.32, y: 0.28 },
  // Colombia/Venezuela coast
  { x: 0.38, y: 0.26 },
  { x: 0.48, y: 0.24 },
  { x: 0.54, y: 0.26 },
  { x: 0.58, y: 0.28 },
  // Brazil bulge
  { x: 0.62, y: 0.32 },
  { x: 0.68, y: 0.38 },
  { x: 0.72, y: 0.44 },
  { x: 0.70, y: 0.50 },
  // Brazil south
  { x: 0.64, y: 0.58 },
  { x: 0.58, y: 0.64 },
  { x: 0.52, y: 0.68 },
  // Uruguay/Argentina
  { x: 0.48, y: 0.74 },
  { x: 0.46, y: 0.80 },
  { x: 0.44, y: 0.86 },
  // Tierra del Fuego
  { x: 0.40, y: 0.92 },
  { x: 0.36, y: 0.94 },
  // Chile coast up
  { x: 0.32, y: 0.88 },
  { x: 0.30, y: 0.80 },
  { x: 0.28, y: 0.70 },
  { x: 0.26, y: 0.60 },
  { x: 0.24, y: 0.50 },
  { x: 0.22, y: 0.40 },
  // Peru/Ecuador
  { x: 0.20, y: 0.34 },
  { x: 0.22, y: 0.30 },
  { x: 0.24, y: 0.26 },
  // Back to Mexico
  { x: 0.22, y: 0.20 },
  { x: 0.20, y: 0.14 },
  { x: 0.24, y: 0.10 },
  { x: 0.28, y: 0.06 },
];

// Major cities for the 6 countries
const CITIES = [
  { name: 'Ciudad de México', x: 0.24, y: 0.14, country: 'MX', flag: '🇲🇽' },
  { name: 'Bogotá', x: 0.38, y: 0.30, country: 'CO', flag: '🇨🇴' },
  { name: 'Lima', x: 0.26, y: 0.42, country: 'PE', flag: '🇵🇪' },
  { name: 'Caracas', x: 0.52, y: 0.26, country: 'VE', flag: '🇻🇪' },
  { name: 'Santiago', x: 0.32, y: 0.76, country: 'CL', flag: '🇨🇱' },
  { name: 'Buenos Aires', x: 0.44, y: 0.78, country: 'AR', flag: '🇦🇷' },
];

// Faint country border segments (dashed lines)
const BORDERS = [
  // Chile-Argentina border (Andes)
  [{ x: 0.34, y: 0.94 }, { x: 0.32, y: 0.80 }, { x: 0.30, y: 0.65 }, { x: 0.28, y: 0.50 }],
  // Colombia-Venezuela
  [{ x: 0.42, y: 0.28 }, { x: 0.48, y: 0.30 }, { x: 0.52, y: 0.28 }],
  // Peru-Colombia
  [{ x: 0.28, y: 0.32 }, { x: 0.36, y: 0.34 }, { x: 0.42, y: 0.32 }],
];

const ACCENT = '#c084fc';
const ACCENT_RGB = { r: 192, g: 132, b: 252 };

export function initBackground() {
  const container = $('bgShapes');
  if (!container) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'bg-canvas';
  container.appendChild(canvas);

  let w = window.innerWidth;
  let h = window.innerHeight;
  let dpr = window.devicePixelRatio || 1;
  let ctx = canvas.getContext('2d');

  // Mouse position (defaults to center)
  let mouseX = w / 2;
  let mouseY = h / 2;
  let targetMouseX = mouseX;
  let targetMouseY = mouseY;

  // Smooth mouse tracking
  function updateMouse() {
    mouseX += (targetMouseX - mouseX) * 0.08;
    mouseY += (targetMouseY - mouseY) * 0.08;
  }

  // Mouse move listener
  window.addEventListener('mousemove', (e) => {
    targetMouseX = e.clientX;
    targetMouseY = e.clientY;
  });

  // Touch support
  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      targetMouseX = e.touches[0].clientX;
      targetMouseY = e.touches[0].clientY;
    }
  });

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  // Calculate map bounds to center and scale the continent
  function getMapBounds() {
    const padding = 0.15;
    const mapW = w * (1 - padding * 2);
    const mapH = h * (1 - padding * 2);
    const offsetX = w * padding;
    const offsetY = h * padding;
    return { mapW, mapH, offsetX, offsetY };
  }

  // Convert normalized coords to screen coords
  function toScreen(nx, ny, bounds) {
    return {
      x: bounds.offsetX + nx * bounds.mapW,
      y: bounds.offsetY + ny * bounds.mapH,
    };
  }

  // Draw continent outline with glow
  function drawContinentOutline(timestamp, parallaxX, parallaxY) {
    const bounds = getMapBounds();
    const glowPulse = 0.04 + Math.sin(timestamp * 0.001) * 0.01;

    ctx.save();
    ctx.translate(parallaxX, parallaxY);

    // Glow layer (drawn first, larger blur)
    ctx.shadowBlur = 12;
    ctx.shadowColor = ACCENT;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = glowPulse;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    LATAM_PATH.forEach((pt, i) => {
      const { x, y } = toScreen(pt.x, pt.y, bounds);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();

    // Sharper line on top
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.06;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  // Draw faint country borders
  function drawBorders(parallaxX, parallaxY) {
    const bounds = getMapBounds();

    ctx.save();
    ctx.translate(parallaxX, parallaxY);
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.03;
    ctx.lineCap = 'round';

    BORDERS.forEach((border) => {
      ctx.beginPath();
      border.forEach((pt, i) => {
        const { x, y } = toScreen(pt.x, pt.y, bounds);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    ctx.setLineDash([]);
    ctx.restore();
  }

  // Draw city markers with pulsing animation
  function drawCityMarkers(timestamp, parallaxX, parallaxY) {
    const bounds = getMapBounds();

    ctx.save();
    ctx.translate(parallaxX, parallaxY);

    CITIES.forEach((city, i) => {
      const { x, y } = toScreen(city.x, city.y, bounds);

      // Pulsing opacity (each city offset by index for wave effect)
      const pulse = 0.12 + Math.sin(timestamp * 0.002 + i * 1.2) * 0.06;
      const ringPulse = 0.06 + Math.sin(timestamp * 0.0015 + i * 1.2) * 0.03;

      // Outer ring (pulsing)
      ctx.beginPath();
      ctx.arc(x, y, 8 + Math.sin(timestamp * 0.002 + i) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = ringPulse;
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT;
      ctx.globalAlpha = pulse;
      ctx.fill();

      // Core bright point
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.globalAlpha = pulse + 0.08;
      ctx.fill();
    });

    ctx.restore();
  }

  // Draw cursor glow
  function drawCursorGlow() {
    const radius = 180;
    const gradient = ctx.createRadialGradient(
      mouseX, mouseY, 0,
      mouseX, mouseY, radius
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

  // Draw subtle grid overlay
  function drawGrid(parallaxX, parallaxY) {
    const gridSpacing = Math.max(100, Math.min(w, h) * 0.1);

    ctx.save();
    ctx.translate(parallaxX * 0.3, parallaxY * 0.3);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.02;

    // Horizontal lines
    for (let y = gridSpacing; y < h + 50; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(-50, y);
      ctx.lineTo(w + 50, y);
      ctx.stroke();
    }

    // Vertical lines
    for (let x = gridSpacing; x < w + 50; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, -50);
      ctx.lineTo(x, h + 50);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Main animation loop
  function draw(timestamp) {
    // Update smooth mouse position
    updateMouse();

    // Setup canvas
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Time-based ambient drift
    const driftX = Math.sin(timestamp * 0.00008) * 15;
    const driftY = Math.cos(timestamp * 0.00006) * 10;

    // Mouse parallax (map moves opposite to cursor)
    const parallaxX = (mouseX - w / 2) * -0.015 + driftX;
    const parallaxY = (mouseY - h / 2) * -0.015 + driftY;

    // Draw layers (back to front)
    drawGrid(parallaxX, parallaxY);
    drawContinentOutline(timestamp, parallaxX, parallaxY);
    drawBorders(parallaxX, parallaxY);
    drawCityMarkers(timestamp, parallaxX, parallaxY);
    drawCursorGlow();

    requestAnimationFrame(draw);
  }

  // Initialize
  resize();
  requestAnimationFrame(draw);

  // Debounced resize handler
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 100);
  });
}
