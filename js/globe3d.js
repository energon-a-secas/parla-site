// -- 3D globe --
// The stage. A lit sphere with the dictionary's countries raised as solid
// plateaus in their own colours, a camera that centres a country by longitude
// AND latitude, and a projector the overlay uses to pin term cards to land.
//
// Render-on-demand: frames are drawn only while something is moving, so an
// idle globe costs nothing. There is deliberately no idle spin.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  DEG, lonLatToVec3, vec3ToLonLat, greatCircleDeg, sphericalCentroid,
  buildLandGeometry, buildWallGeometry, buildBorderGeometry,
} from './geo.js';

const OCEAN_COLOR = 0x0b1226;
const WORLD_COLOR = 0x161d33;
const CONTEXT_COLOR = 0x1d2540;
const ACCENT = 0xc084fc;

const R_OCEAN = 1.0;
const R_GRATICULE = 1.001;
const R_WORLD = 1.002;
const R_CONTEXT = 1.003;
const R_FOCUS = 1.006;
const R_BORDER = 1.0065;
// Walls start well inside the ocean so a raised country never opens a gap at
// its own coastline. Everything below r=1 is hidden by the opaque sphere.
const R_WALL_INNER = 0.97;

const MAX_EDGE_FOCUS = 1.5;
const MAX_EDGE_CONTEXT = 3;
const MAX_EDGE_WORLD = 4;

const FOV = 35;
const HOME = { lon: -75, lat: -12 };
const TWEEN_MS = 700;
const MAX_FIT_ANGLE = 26;   // a huge country must not shrink the globe to a marble
// The home view frames Latin America, which is the product. The US takes part
// but must not drag the default camera up over North America.
const HOME_FIT_ANGLE = 44;
const FIT_PAD = 6;

// Plateau heights, as a scale on the base focus radius.
const LIFT_BASE = 1;
const LIFT_ACTIVE = 1.010 / R_FOCUS;
const LIFT_SELECTED = 1.018 / R_FOCUS;
const LIFT_HOVER = 0.004;

function unsupportedStub(reason) {
  return {
    supported: false,
    reason,
    ready: Promise.resolve(),
    focusCountry() {}, frameCountries() {}, setSelection() {}, setBottomInset() {},
    goHome() {}, isHomeView: () => true,
    project: () => null, globeScreen: () => null, resize() {}, dispose() {},
    onPick: null, onHover: null, onFrame: null, onSettle: null,
  };
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function shortestLonDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

/**
 * OrbitControls' azimuth for a given longitude, under geo.js's convention.
 * The clamp window built from this must never straddle +/-pi, or r160's
 * azimuth normalisation locks rotation entirely. At the current home
 * longitude the window is roughly [-0.79, +1.31], which is clear of it.
 */
function azimuthOfLon(lon) {
  const v = lonLatToVec3(lon, 0, 1);
  return Math.atan2(v.x, v.z);
}

export function createGlobe3D(container, { countries, geometry, reducedMotion = false }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (err) {
    return unsupportedStub(err.message);
  }

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // No tone mapping on purpose: the country hues are data, not decoration, and
  // ACES visibly desaturates the yellow and the rose.
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'globe-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;           // panning would slide the globe off centre
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 1.45;
  controls.maxDistance = 4.2;
  // Rotation is bounded so Latin America cannot leave the screen. The earlier
  // +/-60 degree azimuth combined with a wide polar range let a single drag
  // swing South America off the limb and leave the user staring at open ocean
  // with no way back. These bounds keep the landmass in frame at every angle.
  // The bounds still have to admit every country anchor, or focusing one would
  // be clamped short of centring it. Los Angeles at 34.05 N is the northern
  // constraint and Buenos Aires at 34.6 S the southern one.
  controls.minPolarAngle = 0.95;        // ~36 N
  controls.maxPolarAngle = 2.40;        // ~47 S
  controls.minAzimuthAngle = azimuthOfLon(HOME.lon) - 32 * DEG;
  controls.maxAzimuthAngle = azimuthOfLon(HOME.lon) + 32 * DEG;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

  scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x0a0f20, 0.85));
  const key = new THREE.DirectionalLight(0xfff4e8, 1.5);
  key.position.set(3, 2, 4);
  const fill = new THREE.DirectionalLight(0x9fc0ff, 0.35);
  fill.position.set(-4, -1, 2);
  const rim = new THREE.DirectionalLight(0xd8b4fe, 0.5);
  rim.position.set(0, 1, -5);
  scene.add(key, fill, rim);

  // -- Static layers --------------------------------------------------------

  const ocean = new THREE.Mesh(
    new THREE.SphereGeometry(R_OCEAN, 96, 64),
    new THREE.MeshStandardMaterial({ color: OCEAN_COLOR, roughness: 0.9, metalness: 0 }),
  );
  scene.add(ocean);

  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.09, 48, 32),
    new THREE.MeshBasicMaterial({
      color: ACCENT, side: THREE.BackSide, transparent: true,
      opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  ));

  scene.add(new THREE.LineSegments(
    buildGraticule(R_GRATICULE),
    new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.05 }),
  ));

  if (geometry.world?.length) {
    scene.add(new THREE.Mesh(
      buildLandGeometry(geometry.world, R_WORLD, MAX_EDGE_WORLD),
      new THREE.MeshStandardMaterial({ color: WORLD_COLOR, roughness: 1, metalness: 0 }),
    ));
  }
  if (geometry.context?.length) {
    scene.add(new THREE.Mesh(
      buildLandGeometry(geometry.context, R_CONTEXT, MAX_EDGE_CONTEXT),
      new THREE.MeshStandardMaterial({ color: CONTEXT_COLOR, roughness: 1, metalness: 0 }),
    ));
  }

  // -- Focus countries ------------------------------------------------------

  /** code -> { group, fill, material, border, baseColor, vertices, anchor } */
  const lands = new Map();
  const pickTargets = [];

  for (const [code, meta] of Object.entries(countries)) {
    const rings = geometry.focus?.[code];
    if (!rings?.length) continue;

    const base = new THREE.Color(meta.color);
    const material = new THREE.MeshStandardMaterial({
      color: base.clone(), roughness: 0.55, metalness: 0,
      emissive: base.clone(), emissiveIntensity: 0.06,
    });

    const group = new THREE.Group();
    const fillMesh = new THREE.Mesh(buildLandGeometry(rings, R_FOCUS, MAX_EDGE_FOCUS), material);
    fillMesh.userData.code = code;
    const wall = new THREE.Mesh(
      buildWallGeometry(rings, R_WALL_INNER, R_FOCUS),
      new THREE.MeshStandardMaterial({
        color: base.clone(), roughness: 0.65, metalness: 0, side: THREE.DoubleSide,
      }),
    );
    const border = new THREE.LineSegments(
      buildBorderGeometry(rings, R_BORDER),
      new THREE.LineBasicMaterial({
        color: base.clone().lerp(new THREE.Color(0xffffff), 0.25),
        transparent: true, opacity: 0.75,
      }),
    );
    group.add(fillMesh, wall, border);
    scene.add(group);
    pickTargets.push(fillMesh);

    // Flattened vertex list, used to fit the camera around a country.
    const verts = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 2) verts.push(ring[i], ring[i + 1]);
    }

    lands.set(code, {
      group, material, wallMaterial: wall.material, borderMaterial: border.material,
      baseColor: base, verts, anchor: meta.anchor,
      lift: LIFT_BASE, targetLift: LIFT_BASE,
    });
  }

  function buildGraticule(radius) {
    const pos = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const seg = (lon1, lat1, lon2, lat2) => {
      lonLatToVec3(lon1, lat1, radius, a);
      lonLatToVec3(lon2, lat2, radius, b);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    };
    for (let lat = -75; lat <= 75; lat += 15) {
      for (let lon = -180; lon < 180; lon += 5) seg(lon, lat, lon + 5, lat);
    }
    for (let lon = -180; lon < 180; lon += 15) {
      for (let lat = -85; lat < 85; lat += 5) seg(lon, lat, lon, lat + 5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return geo;
  }

  // -- Camera ---------------------------------------------------------------

  let tween = null;

  function currentView() {
    const { lon, lat } = vec3ToLonLat(camera.position);
    return { lon, lat, dist: camera.position.length() };
  }

  /**
   * The home distance the camera can actually reach. A tall portrait viewport
   * needs to pull back further than a wide one, so this must be compared
   * against the clamped value: measuring against the raw fit made isHomeView()
   * permanently false on phones, and the reset control never went away.
   */
  function homeDistance() {
    return THREE.MathUtils.clamp(
      fitDistance(HOME_FIT_ANGLE, HOME_FIT_ANGLE),
      controls.minDistance,
      controls.maxDistance,
    );
  }

  /** True when the camera is sitting on the default Latin America view. */
  function isHomeView() {
    const v = currentView();
    return Math.abs(shortestLonDelta(HOME.lon, v.lon)) < 3
      && Math.abs(v.lat - HOME.lat) < 3
      && Math.abs(v.dist - homeDistance()) < 0.15;
  }

  function goHome(animate = true) {
    setView(HOME.lon, HOME.lat, homeDistance(), animate);
  }

  function applyView(lon, lat, dist) {
    camera.up.set(0, 1, 0);   // north stays up: this is a map, not a spaceship

    // OrbitControls keeps damped momentum from the user's last drag and adds it
    // on every update(), which would tug a programmatic move back off target and
    // leave the camera short of where it was sent. Updating once with damping
    // disabled applies that leftover in full and zeroes it, so re-asserting the
    // position afterwards actually sticks.
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();

    lonLatToVec3(lon, lat, dist, camera.position);
    camera.lookAt(0, 0, 0);
    controls.update();
    controls.enableDamping = damping;

    requestRender();
  }

  /**
   * Interpolating in spherical (lon, lat, dist) rather than slerping keeps
   * north up, makes longitude wrap a one-liner, and expresses the motion in
   * the same coordinates as the clamps.
   */
  function setView(lon, lat, dist, animate = true) {
    const from = currentView();
    const to = {
      lon: from.lon + shortestLonDelta(from.lon, lon),
      lat: THREE.MathUtils.clamp(lat, -73, 73),
      dist: THREE.MathUtils.clamp(dist, controls.minDistance, controls.maxDistance),
    };
    if (!animate || reducedMotion) {
      tween = null;
      applyView(to.lon, to.lat, to.dist);
      return;
    }
    tween = { from, to, t0: performance.now() };
    requestRender();
  }

  function stepTween(now) {
    if (!tween) return false;
    const k = Math.min(1, (now - tween.t0) / TWEEN_MS);
    const e = easeInOutCubic(k);
    const { from, to } = tween;
    applyView(
      from.lon + (to.lon - from.lon) * e,
      from.lat + (to.lat - from.lat) * e,
      from.dist + (to.dist - from.dist) * e,
    );
    if (k >= 1) tween = null;
    return true;
  }

  // The user always wins: any input cancels an in-flight camera move.
  controls.addEventListener('start', () => { tween = null; });

  // Report the view on the definitive end-of-interaction signal as well as on
  // the render loop's settle. Relying on settle alone loses the notification
  // whenever the loop is throttled, and the reset control would never appear.
  controls.addEventListener('end', () => api.onViewChange?.(isHomeView()));

  /** Distance at which a cap of angular radius `deg` exactly fills the frame. */
  function fitDistance(deg, cap = MAX_FIT_ANGLE) {
    const a = Math.min(deg, cap) * DEG
      // A portrait viewport fits on its narrow horizontal axis, so it already
      // pulls back a long way. Extra padding there just pushes the globe away.
      + (container.clientWidth < 600 ? 4 : FIT_PAD) * DEG;
    const aspect = camera.aspect || 1;
    const halfV = Math.atan(Math.tan((FOV * DEG) / 2) * Math.min(1, aspect));
    return Math.cos(a) + Math.sin(a) / Math.tan(halfV);
  }

  function frameCountries(codes, { weight = null, animate = true } = {}) {
    const known = (codes || []).filter((c) => lands.has(c));
    if (!known.length) {
      goHome(animate);
      return;
    }
    const pts = known.map((c) => lands.get(c).anchor);
    const weights = known.map((c) => (c === weight ? 2 : 1));
    const centre = sphericalCentroid(pts, weights);

    let radius = 0;
    for (const code of known) {
      const { verts } = lands.get(code);
      for (let i = 0; i < verts.length; i += 2) {
        const d = greatCircleDeg(centre.lon, centre.lat, verts[i], verts[i + 1]);
        if (d > radius) radius = d;
      }
    }
    // A single country caps tight, so one huge country cannot shrink the globe
    // to a marble. A concept spanning several countries has to show all of
    // them, and US to Chile is roughly 90 degrees of arc.
    const cap = known.length > 1 ? HOME_FIT_ANGLE : MAX_FIT_ANGLE;
    setView(centre.lon, centre.lat, fitDistance(radius, cap), animate);
  }

  function focusCountry(code, animate = true) {
    if (!code || !lands.has(code)) {
      // Deliberately the fixed home view, not the centroid of all countries:
      // including the US in that average drags the camera up over North
      // America, and Latin America is the product.
      goHome(animate);
      return;
    }
    frameCountries([code], { animate });
  }

  // -- Selection ------------------------------------------------------------

  const view = { selected: null, inConcept: new Set(), hover: null };
  const dimTarget = new THREE.Color(OCEAN_COLOR);

  function applySelection() {
    const anySelection = view.selected || view.inConcept.size > 0;
    for (const [code, land] of lands) {
      const isSelected = code === view.selected;
      const inConcept = view.inConcept.has(code);
      const lit = isSelected || inConcept || !anySelection;

      land.material.color.copy(land.baseColor);
      land.wallMaterial.color.copy(land.baseColor);
      if (!lit) {
        // Dimmed, never hidden: the rest of the map still has to be readable.
        land.material.color.lerp(dimTarget, 0.55);
        land.wallMaterial.color.lerp(dimTarget, 0.55);
      }
      land.material.emissiveIntensity = isSelected ? 0.14 : inConcept ? 0.08 : lit ? 0.06 : 0;
      land.borderMaterial.opacity = lit ? (isSelected ? 1 : 0.75) : 0.35;

      let lift = LIFT_BASE;
      if (isSelected) lift = LIFT_SELECTED;
      else if (inConcept) lift = LIFT_ACTIVE;
      if (code === view.hover) lift += LIFT_HOVER;
      land.targetLift = lift;
      if (reducedMotion) {
        land.lift = lift;
        land.group.scale.setScalar(lift);
      }
    }
    requestRender();
  }

  function setSelection({ country = null, countries = [] } = {}) {
    view.selected = country;
    view.inConcept = new Set(countries);
    applySelection();
  }

  function stepLifts() {
    let moving = false;
    for (const land of lands.values()) {
      const d = land.targetLift - land.lift;
      if (Math.abs(d) < 1e-5) {
        if (land.lift !== land.targetLift) {
          land.lift = land.targetLift;
          land.group.scale.setScalar(land.lift);
        }
        continue;
      }
      land.lift += d * 0.18;
      land.group.scale.setScalar(land.lift);
      moving = true;
    }
    return moving;
  }

  // -- Projection for the DOM overlay ---------------------------------------

  const _p = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _cam = new THREE.Vector3();

  /**
   * Project a lon/lat onto the canvas.
   * `front` is a true horizon test, not an approximation: a point is visible
   * when its angle from the sub-camera point is under acos(r / distance).
   */
  function project(lon, lat, radius = R_FOCUS) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return null;

    lonLatToVec3(lon, lat, radius, _p);
    _n.copy(_p).normalize();
    _cam.copy(camera.position);
    const dist = _cam.length();
    const horizon = dist > 0 ? radius / dist : 1;
    const facing = _n.dot(_cam.normalize());

    _p.project(camera);   // in place: _n already holds the direction we need
    return {
      x: (_p.x * 0.5 + 0.5) * w,
      y: (-_p.y * 0.5 + 0.5) * h,
      front: facing > horizon,
      facing,
      normal: { x: _n.x, y: _n.y, z: _n.z },
    };
  }

  function projectCountry(code) {
    const land = lands.get(code);
    if (!land?.anchor) return null;
    return project(land.anchor.lon, land.anchor.lat);
  }

  /** Screen-space centre and silhouette radius of the globe, for rim pinning. */
  function globeScreen() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return null;
    const ndc = new THREE.Vector3(0, 0, 0).project(camera);
    const dist = camera.position.length();
    const halfV = (FOV * DEG) / 2;
    const radiusPx = (h / 2) * (Math.tan(Math.asin(Math.min(1, R_OCEAN / dist))) / Math.tan(halfV));
    return {
      cx: (ndc.x * 0.5 + 0.5) * w,
      cy: (-ndc.y * 0.5 + 0.5) * h,
      radius: radiusPx,
      width: w,
      height: h,
    };
  }

  // -- Input ----------------------------------------------------------------

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downPos = null;
  let hoverEvent = null;

  function pickAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickTargets, false)[0];
    return hit ? hit.object.userData.code : null;
  }

  const ac = new AbortController();
  const opts = { signal: ac.signal };
  const canvas = renderer.domElement;

  canvas.addEventListener('pointerdown', (e) => {
    downPos = [e.clientX, e.clientY];
  }, opts);

  canvas.addEventListener('pointerup', (e) => {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
    downPos = null;
    if (moved > 6) return;              // that was a drag, not a tap
    const code = pickAt(e.clientX, e.clientY);
    if (code && api.onPick) api.onPick(code);
  }, opts);

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    hoverEvent = e;                     // resolved once per frame, never here
  }, opts);

  canvas.addEventListener('pointerleave', () => {
    hoverEvent = null;
    if (view.hover) {
      view.hover = null;
      applySelection();
      api.onHover?.(null);
    }
    canvas.style.cursor = '';
  }, opts);

  function processHover() {
    if (!hoverEvent) return;
    const code = pickAt(hoverEvent.clientX, hoverEvent.clientY);
    hoverEvent = null;
    canvas.style.cursor = code ? 'pointer' : '';
    if (code !== view.hover) {
      view.hover = code;
      applySelection();
      api.onHover?.(code);
    }
  }

  // -- Render-on-demand loop ------------------------------------------------

  let dirty = true;
  let rafId = 0;
  let wasMoving = false;

  function requestRender() { dirty = true; }
  controls.addEventListener('change', requestRender);

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    processHover();
    const tweening = stepTween(now);
    controls.update();
    const lifting = stepLifts();

    const moving = dirty || tweening || lifting;
    if (moving) {
      renderer.render(scene, camera);
      dirty = false;
      api.onFrame?.();
      wasMoving = true;
    } else if (wasMoving) {
      // Everything has come to rest. The overlay does its collision pass here
      // rather than every frame, so cards do not jitter while you drag.
      wasMoving = false;
      api.onSettle?.();
      api.onViewChange?.(isHomeView());
    }
  }

  // The dock covers the foot of the stage, so the globe is centred in the
  // band that is actually visible rather than in the canvas. Offsetting the
  // frustum (rather than aiming the camera further south) keeps the geographic
  // centre honest: the country you selected is still the one facing you.
  let bottomInset = 0;

  function applyViewOffset(w, h) {
    if (bottomInset > 0) camera.setViewOffset(w, h, 0, Math.round(bottomInset / 2), w, h);
    else camera.clearViewOffset();
  }

  function setBottomInset(px) {
    const next = Math.max(0, Math.min(px || 0, container.clientHeight * 0.5));
    if (Math.abs(next - bottomInset) < 1) return;
    bottomInset = next;
    resize();
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;

    // The home distance is derived from the aspect ratio, so a resize changes
    // what "home" means. Refit when we were already there, otherwise rotating a
    // phone leaves the camera at a stale distance and every is-home check fails.
    const wasHome = isHomeView();

    renderer.setSize(w, h);
    camera.aspect = w / h;
    applyViewOffset(w, h);
    camera.updateProjectionMatrix();
    controls.maxDistance = Math.max(4.2, fitDistance(HOME_FIT_ANGLE, HOME_FIT_ANGLE) * 1.02);

    if (wasHome) goHome(false);
    requestRender();
    api.onViewChange?.(isHomeView());
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const api = {
    supported: true,
    reason: null,
    ready: Promise.resolve(),
    focusCountry,
    frameCountries,
    goHome,
    isHomeView,
    setSelection,
    project,
    projectCountry,
    globeScreen,
    resize,
    setBottomInset,
    requestRender,
    hasCountry: (code) => lands.has(code),
    onPick: null,
    onHover: null,
    onFrame: null,
    onSettle: null,
    onViewChange: null,
    dispose() {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      ac.abort();
      controls.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };

  resize();
  applySelection();
  applyView(HOME.lon, HOME.lat, homeDistance());
  requestAnimationFrame(loop);

  return api;
}
