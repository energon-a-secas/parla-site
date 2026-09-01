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
let pendingConcept = null;   // asked for while the stage was still loading
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
  // The pre-flight already put body in globe-mode; nothing to switch here.
  globe.onPick = (code) => onPickCountry?.(code);
  globe.onViewChange = (home) => onViewChanged?.(home);

  const { createOverlay } = await import('./overlay.js');
  overlay = createOverlay({ globe, dictionary });
  globe.onFrame = () => overlay.update();
  globe.onSettle = () => overlay.settle();
  globe.onHover = (code) => overlay.hoverCountry(code);

  trackDock(globe);
  if (pendingConcept) {
    overlay.attach(...pendingConcept);
    pendingConcept = null;
  }
  // Report the opening view once the stage exists. The reset control used to
  // learn where the camera was only from a settle or a drag, so a country
  // restored from localStorage left it hidden until the visitor moved the
  // globe: a filter was on, and the one control that clears it was not there.
  onViewChanged?.(globe.isHomeView());
  return stage;
}

/** Keep the globe centred in the band the dock leaves visible. */
function trackDock(globe) {
  const dock = document.querySelector('.dock');
  if (!dock) return;
  const sync = () => {
    const h = dock.getBoundingClientRect().height;
    globe.setBottomInset(h);
    // Published so CSS can sit things above the dock without measuring it a
    // second time and drifting. The usage popover uses it on narrow viewports.
    document.documentElement.style.setProperty('--dock-height', `${Math.round(h)}px`);
  };
  new ResizeObserver(sync).observe(dock);
  sync();
}

function fallback(reason) {
  // Undoes the pre-flight's optimism. Only reached when a device passes the
  // WebGL check and still fails to give us a context, so this is the one path
  // that can still change the layout after load.
  document.body.classList.remove('globe-mode');
  document.body.classList.add('no-webgl');
  if (reason) console.info('Parla: radial diagram mode.', reason);
  return null;
}

// -- Public API, both modes ------------------------------------------------

/**
 * Make `code` the active country: highlight it, and unless `move` is false,
 * send the camera to it. Boot passes move:false, so a country restored from
 * localStorage keeps its filter and its highlight without opening the map
 * zoomed onto one country with nothing on screen to explain why.
 */
export function focusCountry(code, { move = true } = {}) {
  if (!stage) return;
  if (move) stage.focusCountry(code || null);
  overlay?.setActiveCountry(code || null);
  if (!overlay?.hasConcept()) stage.setSelection({ country: code || null });
}

export function showConcept(concept, matchedVariant, groupedVariants, s) {
  if (!stage) {
    // No stage yet does not mean no stage ever. The pre-flight commits the body
    // to globe-mode at parse time, so between then and the end of initStage a
    // click must be held rather than answered with the radial fallback, which
    // would draw itself over the stage about to appear.
    if (!document.body.classList.contains('globe-mode')) return false;
    pendingConcept = [concept, matchedVariant, groupedVariants, s];
    return true;
  }
  overlay.attach(concept, matchedVariant, groupedVariants, s);
  return true;
}

export function clearConcept() {
  pendingConcept = null;
  overlay?.clear();
  stage?.setSelection({ country: null });
}

export function relayoutStage() {
  stage?.resize();
  overlay?.settle();
}
