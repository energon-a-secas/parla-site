// -- Camera fit --
// The trigonometry behind every camera move, kept free of three.js so it can
// be tested under `node --test` with no WebGL context and no DOM. globe3d.js
// owns the camera and the measurements; this owns the arithmetic they feed.
//
// The bug this file exists to prevent: the dock covers the foot of the stage,
// the camera offsets its frustum to centre the globe in the band that is left,
// but the frustum's field of view still spans the whole canvas. A fit computed
// against the full height therefore draws the globe up to twice the size the
// visitor can actually see. See tests/camerafit.test.mjs.

const DEG = Math.PI / 180;

/** Vertical field of view of the stage camera, degrees. */
export const FOV = 35;

/** The home view frames Latin America, which is the product. The US takes part
 *  but must not drag the default camera up over North America. */
export const HOME_FIT_ANGLE = 44;

/**
 * One country is framed at this fixed angular radius rather than to its own
 * bounds. Fitting each country to itself made the zoom level a function of the
 * country's size: measured against the shipped geometry, Colombia's radius from
 * Bogota is 9.8 degrees and Chile's from Santiago is 22.5, so clicking Colombia
 * put the camera more than twice as close as clicking Chile, and in both cases
 * left no neighbour on screen to click next. 30 degrees is the smallest angle
 * that still contains every country whole except the US (40.3 degrees from Los
 * Angeles), whose slang region is the southwest anyway.
 */
export const FOCUS_FIT_ANGLE = 30;

/** Breathing room around the fitted cap, degrees. A portrait viewport fits on
 *  its narrow horizontal axis and has already pulled back a long way, so extra
 *  padding there only pushes the globe further away. */
export const FIT_PAD = 6;
export const FIT_PAD_NARROW = 4;
export const NARROW_PX = 600;

/**
 * The dock may cover at most this share of the stage. Measured on a 900px
 * viewport with the Explore sheet open, it covers 0.625 of an 783px stage, so
 * the old 0.5 clamp under-corrected by a quarter: the fit was solved for a
 * 392px band that was really 281px, and the frustum was offset to centre the
 * globe 53px below where the band actually is. The remaining headroom keeps a
 * floor under the visible band, because as it approaches zero the fit distance
 * approaches infinity.
 */
export const MAX_INSET_FRACTION = 0.7;

export function clampInset(px, height) {
  return Math.max(0, Math.min(px || 0, height * MAX_INSET_FRACTION));
}

/** Share of the canvas height the dock leaves visible, in (0, 1]. */
export function visibleFraction(height, bottomInset) {
  if (!height) return 1;
  return (height - clampInset(bottomInset, height)) / height;
}

export function fitPad(width) {
  return width < NARROW_PX ? FIT_PAD_NARROW : FIT_PAD;
}

/**
 * How close and how far OrbitControls will let the camera go, and the headroom
 * over the home fit that sets the far limit. They live here because the far
 * limit is derived from a fit and has to stay above every fit the app asks
 * for: a focus move that lands past it is silently clamped short, which looks
 * like the camera refusing to obey.
 */
export const MIN_CAMERA_DISTANCE = 1.45;
export const MAX_CAMERA_DISTANCE_FLOOR = 4.2;
export const MAX_DISTANCE_HEADROOM = 1.02;

/**
 * Distance from the globe's centre at which a spherical cap of angular radius
 * `deg` exactly fills the frame.
 *
 * The fit is taken on whichever axis is tighter. Horizontally that is the
 * aspect ratio; vertically it is the half-angle that survives the dock, which
 * is the whole point of this function. With `visible` at 1 the two branches
 * collapse to `atan(tan(fov/2) * min(1, aspect))`, which is what this computed
 * before the dock was accounted for.
 *
 * @param {number} deg              angular radius to frame, degrees
 * @param {number} opts.aspect      camera aspect, width / height
 * @param {number} [opts.visible]   share of the canvas height left visible, 0..1
 * @param {number} [opts.pad]       breathing room, degrees
 * @param {number} [opts.fov]       vertical field of view, degrees
 */
export function fitDistance(deg, { aspect, visible = 1, pad = FIT_PAD, fov = FOV }) {
  const a = (deg + pad) * DEG;
  const tanHalf = Math.tan((fov * DEG) / 2);
  const half = Math.min(
    Math.atan(tanHalf * visible),
    Math.atan(tanHalf * aspect),
  );
  return Math.cos(a) + Math.sin(a) / Math.tan(half);
}

/**
 * The angular radius to frame a set of countries at. A single country gets the
 * fixed regional angle so its neighbours stay on screen and stay clickable; a
 * concept spanning several has to show all of them, and US to Chile is roughly
 * 90 degrees of arc, so that fit is capped at the home angle instead.
 */
export function fitAngle(count, radius) {
  return count > 1 ? Math.min(radius, HOME_FIT_ANGLE) : FOCUS_FIT_ANGLE;
}

/**
 * The half-angle a cap of radius `deg` subtends from the camera once fitted.
 * Inverse of fitDistance, and the thing worth asserting: it must not exceed
 * the half-angle the dock leaves, which is exactly what it did before the
 * visible band reached the fit.
 */
export function subtendedHalfAngle(deg, { aspect, visible = 1, pad = FIT_PAD, fov = FOV }) {
  const a = (deg + pad) * DEG;
  const d = fitDistance(deg, { aspect, visible, pad, fov });
  return Math.atan(Math.sin(a) / (d - Math.cos(a)));
}

/** The half-angle of the band the dock leaves visible. */
export function visibleHalfAngle({ visible = 1, fov = FOV }) {
  return Math.atan(Math.tan((fov * DEG) / 2) * visible);
}

/** The far limit OrbitControls is given, for a stage of this shape. */
export function maxCameraDistance(view) {
  return Math.max(
    MAX_CAMERA_DISTANCE_FLOOR,
    fitDistance(HOME_FIT_ANGLE, view) * MAX_DISTANCE_HEADROOM,
  );
}
