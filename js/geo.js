// -- Sphere geometry --
// Lon/lat to 3D, and the builders that turn flat outline rings from
// data/americas.json into globe meshes. Pure math, no DOM, no app state.

import * as THREE from 'three';

export const DEG = Math.PI / 180;

/**
 * Lon/lat to a point on a sphere of radius r.
 * North is world +Y. Every other module depends on this convention, so the
 * camera, the picking and the screen projection all agree.
 */
export function lonLatToVec3(lon, lat, r = 1, out = new THREE.Vector3()) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  const sp = Math.sin(phi);
  return out.set(-r * sp * Math.cos(theta), r * Math.cos(phi), r * sp * Math.sin(theta));
}

/** Inverse of lonLatToVec3, ignoring radius. */
export function vec3ToLonLat(v) {
  const len = v.length() || 1;
  const lat = 90 - Math.acos(THREE.MathUtils.clamp(v.y / len, -1, 1)) / DEG;
  let lon = Math.atan2(v.z, -v.x) / DEG - 180;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return { lon, lat };
}

/** Great-circle separation between two lon/lat points, in degrees. */
export function greatCircleDeg(aLon, aLat, bLon, bLat) {
  const p1 = aLat * DEG;
  const p2 = bLat * DEG;
  const dp = (bLat - aLat) * DEG;
  const dl = (bLon - aLon) * DEG;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) / DEG;
}

/**
 * Centroid of lon/lat points, averaged as 3D vectors then re-projected.
 * Averaging longitudes directly would put the midpoint of Mexico and Brazil
 * in the wrong hemisphere whenever the set straddles a wrap.
 */
export function sphericalCentroid(points, weights = null) {
  const sum = new THREE.Vector3();
  const v = new THREE.Vector3();
  points.forEach((p, i) => {
    lonLatToVec3(p.lon, p.lat, 1, v);
    sum.addScaledVector(v, weights ? weights[i] : 1);
  });
  if (sum.lengthSq() < 1e-9) return { lon: points[0].lon, lat: points[0].lat };
  return vec3ToLonLat(sum);
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * Emit one lon/lat triangle onto the sphere, subdivided so it hugs the surface.
 *
 * This is the fix for the one hazard that would wreck the globe: a flat chord
 * across a large country sinks below the sphere. Brazil spans ~40 degrees, and
 * a flat triangle across it at r=1.006 dips to 0.945, so the ocean would punch
 * straight through Brazil's middle. Subdividing until every edge is under
 * maxEdgeDeg leaves a residual sag around 1e-4 of the radius, which is
 * sub-pixel at any zoom the camera clamps allow.
 *
 * Neighbouring triangles can get different subdivision counts, leaving
 * T-junctions. At 1e-4 of a radius, with both sides the same colour, the seam
 * is a fraction of a pixel. A conforming subdivision is not worth the code.
 */
function emitTriangle(ax, ay, bx, by, cx, cy, radius, maxEdgeDeg, pos, nor) {
  const eAB = Math.hypot(bx - ax, by - ay);
  const eBC = Math.hypot(cx - bx, cy - by);
  const eCA = Math.hypot(ax - cx, ay - cy);
  const n = Math.min(12, Math.max(1, Math.ceil(Math.max(eAB, eBC, eCA) / maxEdgeDeg)));

  // Wind counter-clockwise as seen from outside, so FrontSide culling drops
  // the far hemisphere instead of drawing it over the near one.
  lonLatToVec3(ax, ay, radius, _a);
  lonLatToVec3(bx, by, radius, _b);
  lonLatToVec3(cx, cy, radius, _c);
  _n.copy(_ab.subVectors(_b, _a)).cross(_ac.subVectors(_c, _a));
  if (_n.dot(_a) < 0) {
    let tx = bx, ty = by;
    bx = cx; by = cy; cx = tx; cy = ty;
  }

  const put = (i, j) => {
    const u = i / n;
    const v = j / n;
    const w = 1 - u - v;
    lonLatToVec3(ax * w + bx * u + cx * v, ay * w + by * u + cy * v, radius, _a);
    pos.push(_a.x, _a.y, _a.z);
    _a.normalize();
    nor.push(_a.x, _a.y, _a.z);
  };

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      put(i, j); put(i + 1, j); put(i, j + 1);
      if (i + j < n - 1) {
        put(i + 1, j); put(i + 1, j + 1); put(i, j + 1);
      }
    }
  }
}

/**
 * Filled country surface at `radius`.
 * Triangulation uses three's bundled earcut, so no extra dependency and no
 * build-time triangulation step. None of the focus countries have interior
 * holes, so the contour-only call is the whole story.
 */
export function buildLandGeometry(rings, radius, maxEdgeDeg) {
  const pos = [];
  const nor = [];

  for (const ring of rings) {
    if (ring.length < 6) continue;
    const contour = [];
    for (let i = 0; i < ring.length; i += 2) {
      contour.push(new THREE.Vector2(ring[i], ring[i + 1]));
    }
    let faces;
    try {
      faces = THREE.ShapeUtils.triangulateShape(contour, []);
    } catch {
      continue; // a self-intersecting ring is not worth failing the whole globe
    }
    for (const [ia, ib, ic] of faces) {
      const p = contour[ia];
      const q = contour[ib];
      const r = contour[ic];
      emitTriangle(p.x, p.y, q.x, q.y, r.x, r.y, radius, maxEdgeDeg, pos, nor);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

/**
 * The side wall of a raised country: a quad strip from rInner up to rOuter
 * along the boundary. This is what makes a country read as a solid plateau
 * rather than a decal, and it is what catches the key light at the edges.
 */
export function buildWallGeometry(rings, rInner, rOuter) {
  const pos = [];
  const nor = [];
  const lo0 = new THREE.Vector3();
  const lo1 = new THREE.Vector3();
  const hi0 = new THREE.Vector3();
  const hi1 = new THREE.Vector3();
  const nrm = new THREE.Vector3();

  for (const ring of rings) {
    const count = ring.length / 2;
    if (count < 3) continue;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const aLon = ring[i * 2], aLat = ring[i * 2 + 1];
      const bLon = ring[j * 2], bLat = ring[j * 2 + 1];

      lonLatToVec3(aLon, aLat, rInner, lo0);
      lonLatToVec3(bLon, bLat, rInner, lo1);
      lonLatToVec3(aLon, aLat, rOuter, hi0);
      lonLatToVec3(bLon, bLat, rOuter, hi1);

      // Outward-ish normal: the edge midpoint direction is close enough for a
      // wall this thin, and it shades far better than a true face normal.
      nrm.copy(lo0).add(lo1).normalize();

      pos.push(lo0.x, lo0.y, lo0.z, lo1.x, lo1.y, lo1.z, hi1.x, hi1.y, hi1.z);
      pos.push(lo0.x, lo0.y, lo0.z, hi1.x, hi1.y, hi1.z, hi0.x, hi0.y, hi0.z);
      for (let k = 0; k < 6; k++) nor.push(nrm.x, nrm.y, nrm.z);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

/** Closed outline of each ring, for LineSegments. */
export function buildBorderGeometry(rings, radius) {
  const pos = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  for (const ring of rings) {
    const count = ring.length / 2;
    if (count < 2) continue;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      lonLatToVec3(ring[i * 2], ring[i * 2 + 1], radius, a);
      lonLatToVec3(ring[j * 2], ring[j * 2 + 1], radius, b);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}
