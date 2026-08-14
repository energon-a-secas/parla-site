// -- Stage facade --
// The one seam between the app and its visualization. render.js and events.js
// import only from here and never touch three, so the no-WebGL fallback cannot
// be regressed by a change to app code.
//
// Two implementations sit behind this: the 3D globe, and the original radial
// diagram (retained in render.js) for devices without WebGL. Force the
// fallback with ?nogl=1 — nobody exercises that path by accident.

import { $, webglSupported } from './utils.js';

const GEOMETRY_URL = 'data/americas.json';

let stage = null;      // the live globe, or null in fallback mode
let overlay = null;
let onPickCountry = null;
let onViewChanged = null;

export function isGlobeMode() {
  return !!stage;
}

/** Registered by events.js: a country was picked on the globe. */
export function setCountryPickHandler(fn) {
  onPickCountry = fn;
}

/** Registered by events.js: the camera settled, so the reset control can
 *  show itself only when returning home would actually change something. */
export function setViewChangeHandler(fn) {
  onViewChanged = fn;
}

/** Return the camera to the default Latin America view. */
export function resetView() {
  stage?.goHome();
}

/** True in fallback mode too, where there is no camera to be away from home. */
export function isHomeView() {
  return stage ? stage.isHomeView() : true;
}

export async function initStage(dictionary) {
  const host = $('globeStage');
  if (!host || !webglSupported()) return fallback('webgl unavailable');

  let globe;
  try {
    // Dynamic import so a device that failed the pre-flight never downloads
    // the 656 KB of three.js at all.
    const [{ createGlobe3D }, geometry] = await Promise.all([
      import('./globe3d.js'),
      fetch(GEOMETRY_URL).then((r) => {
        if (!r.ok) throw new Error(`${GEOMETRY_URL} ${r.status}`);
        return r.json();
      }),
    ]);

    globe = createGlobe3D(host, {
      countries: dictionary.countries,
      geometry,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
    if (!globe.supported) return fallback(globe.reason);
  } catch (err) {
    console.warn('Globe unavailable, falling back to the radial diagram:', err);
    return fallback(err.message);
  }

  stage = globe;
  document.body.classList.add('globe-mode');
  globe.onPick = (code) => onPickCountry?.(code);
  globe.onViewChange = (home) => onViewChanged?.(home);

  const { createOverlay } = await import('./overlay.js');
  overlay = createOverlay({ globe, dictionary });
  globe.onFrame = () => overlay.update();
  globe.onSettle = () => overlay.settle();
  globe.onHover = (code) => overlay.hoverCountry(code);

  trackDock(globe);
  return stage;
}

/** Keep the globe centred in the band the dock leaves visible. */
function trackDock(globe) {
  const dock = document.querySelector('.dock');
  if (!dock) return;
  const sync = () => globe.setBottomInset(dock.getBoundingClientRect().height);
  new ResizeObserver(sync).observe(dock);
  sync();
}

function fallback(reason) {
  document.body.classList.add('no-webgl');
  if (reason) console.info('Parla: radial diagram mode.', reason);
  return null;
}

// -- Public API, both modes ------------------------------------------------

export function focusCountry(code) {
  stage?.focusCountry(code || null);
  if (stage) {
    overlay?.setActiveCountry(code || null);
    if (!overlay?.hasConcept()) stage.setSelection({ country: code || null });
  }
}

export function showConcept(concept, matchedVariant, groupedVariants, s) {
  if (!stage) return false;
  overlay.attach(concept, matchedVariant, groupedVariants, s);
  return true;
}

export function clearConcept() {
  overlay?.clear();
  stage?.setSelection({ country: null });
}

export function relayoutStage() {
  stage?.resize();
  overlay?.settle();
}
