#!/usr/bin/env python3
"""Build data/americas.json — the globe's country geometry.

Reads the focus-country list from api/v1/dictionary.json, so adding a country
to the map is one dictionary entry plus a rerun of this script. Stdlib only,
no build step: the output is committed and served as a static asset.

    python3 scripts/build_geometry.py
    python3 scripts/build_geometry.py --cache /tmp/ne50.geojson

Source: Natural Earth 1:50m admin 0 countries (public domain).

Output shape — rings are flat interleaved [lon,lat,lon,lat,...] number arrays,
about 25% smaller than pair arrays and directly loopable in JS:

    { "version": 1, "focus": {"CL": [ring, ...], ...},
      "context": [ring, ...], "world": [ring, ...] }

Triangulation happens in the browser (three.js bundles earcut), so this file
ships outlines only. Pre-triangulating would quadruple it for no real gain.
"""

import argparse
import json
import math
import os
import sys
import urllib.request

SOURCE_URL = (
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/'
    'master/geojson/ne_50m_admin_0_countries.geojson'
)

DICT_PATH = 'api/v1/dictionary.json'
OUT_PATH = 'data/americas.json'

# tier -> (douglas-peucker tolerance in degrees, min ring area deg^2, decimals)
TIERS = {
    'focus':   (0.05, 0.02, 3),
    'context': (0.20, 0.30, 2),
    'world':   (0.50, 1.00, 2),
}

AMERICAS = {'North America', 'South America'}
SKIP_CONTINENTS = {'Antarctica', 'Seven seas (open ocean)'}

# Alaska's Aleutian rings cross the antimeridian, which breaks flat lon/lat
# triangulation, and a LATAM globe with Alaska hanging off the top reads badly.
# Spanglish is a CONUS phenomenon anyway. Rings not fully inside are dropped.
CLIP = {'US': (-125.5, 24.0, -66.5, 49.5)}


def fetch(cache):
    if cache and os.path.exists(cache):
        print(f'using cached {cache}')
        with open(cache, encoding='utf-8') as f:
            return json.load(f)
    print(f'downloading {SOURCE_URL}')
    with urllib.request.urlopen(SOURCE_URL, timeout=120) as r:
        raw = r.read()
    if cache:
        with open(cache, 'wb') as f:
            f.write(raw)
        print(f'cached to {cache}')
    return json.loads(raw)


def perpendicular(p, a, b):
    """Distance from p to segment ab.

    The zero-length guard is load-bearing: GeoJSON rings are closed, so
    pts[0] == pts[-1] and the very first Douglas-Peucker baseline has zero
    length. Without it every ring collapses to two points and the build
    silently emits a globe of triangle shards.
    """
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    seg = dx * dx + dy * dy
    if seg == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(points, tol):
    """Iterative Douglas-Peucker (recursion would blow the stack on big rings)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi <= lo + 1:
            continue
        worst, idx = -1.0, -1
        for i in range(lo + 1, hi):
            d = perpendicular(points[i], points[lo], points[hi])
            if d > worst:
                worst, idx = d, i
        if worst > tol:
            keep[idx] = True
            stack.append((lo, idx))
            stack.append((idx, hi))
    return [p for p, k in zip(points, keep) if k]


def ring_area(points):
    """Unsigned shoelace area in square degrees. Only used for filtering."""
    a = 0.0
    for i in range(len(points)):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % len(points)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0


def rings_of(geom):
    """Outer rings only. None of the focus countries have interior holes."""
    t = geom['type']
    if t == 'Polygon':
        return [geom['coordinates'][0]]
    if t == 'MultiPolygon':
        return [poly[0] for poly in geom['coordinates']]
    return []


def process(rings, tol, min_area, decimals, clip=None, label=''):
    out = []
    for ring in rings:
        pts = [(float(x), float(y)) for x, y in ring]

        if clip:
            lo_lon, lo_lat, hi_lon, hi_lat = clip
            if not all(lo_lon <= x <= hi_lon and lo_lat <= y <= hi_lat for x, y in pts):
                continue

        # Natural Earth already splits antimeridian-crossing landmasses, so this
        # should never fire. If it does, a flat lon/lat triangulation of that
        # ring would smear a country across the whole globe.
        lons = [x for x, _ in pts]
        if max(lons) - min(lons) > 180:
            print(f'  WARNING: skipping antimeridian ring in {label}', file=sys.stderr)
            continue

        if ring_area(pts) < min_area:
            continue

        pts = simplify(pts, tol)
        if len(pts) < 4:
            continue

        # Drop the duplicated closing point: the renderer closes rings itself.
        if pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3:
            continue

        flat = []
        for x, y in pts:
            flat.append(round(x, decimals))
            flat.append(round(y, decimals))
        out.append(flat)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--cache', help='path to cache/reuse the Natural Earth download')
    ap.add_argument('--out', default=OUT_PATH)
    args = ap.parse_args()

    with open(DICT_PATH, encoding='utf-8') as f:
        focus_codes = list(json.load(f)['countries'])
    print(f'focus countries from {DICT_PATH}: {", ".join(focus_codes)}')

    gj = fetch(args.cache)

    focus, context, world = {}, [], []
    seen = set()

    for feat in gj['features']:
        props = feat['properties']
        code = props.get('ISO_A2') or props.get('ISO_A2_EH')
        continent = props.get('CONTINENT')
        rings = rings_of(feat['geometry'])
        if not rings:
            continue

        if code in focus_codes:
            tol, area, dec = TIERS['focus']
            focus[code] = process(rings, tol, area, dec, CLIP.get(code), code)
            seen.add(code)
        elif continent in AMERICAS:
            tol, area, dec = TIERS['context']
            context.extend(process(rings, tol, area, dec, None, props.get('NAME', '?')))
        elif continent not in SKIP_CONTINENTS:
            tol, area, dec = TIERS['world']
            world.extend(process(rings, tol, area, dec, None, props.get('NAME', '?')))

    missing = [c for c in focus_codes if c not in seen]
    if missing:
        print(f'ERROR: no geometry matched for {missing}', file=sys.stderr)
        return 1

    out = {
        'version': 1,
        'source': 'Natural Earth 1:50m admin 0 countries (public domain)',
        'tolerance': {k: v[0] for k, v in TIERS.items()},
        'focus': focus,
        'context': context,
        'world': world,
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))

    n_rings = sum(len(r) for r in focus.values()) + len(context) + len(world)
    n_points = (
        sum(len(r) for rings in focus.values() for r in rings)
        + sum(len(r) for r in context)
        + sum(len(r) for r in world)
    ) // 2
    size = os.path.getsize(args.out)

    for code in focus_codes:
        pts = sum(len(r) for r in focus[code]) // 2
        print(f'  {code}: {len(focus[code]):3d} rings, {pts:5d} points')
    print(f'  context: {len(context):3d} rings, {sum(len(r) for r in context) // 2:5d} points')
    print(f'  world:   {len(world):3d} rings, {sum(len(r) for r in world) // 2:5d} points')
    print(f'\n{args.out}: {n_rings} rings, {n_points} points, {size / 1024:.1f} KB')

    # A silent Douglas-Peucker collapse is the failure mode that costs hours to
    # find, because it produces a plausible-looking file full of 2-point rings.
    assert n_points > 5000, f'suspiciously few points ({n_points}) — check the DP guard'
    assert size < 150 * 1024, f'{size / 1024:.1f} KB exceeds the 150 KB budget'
    print('checks passed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
