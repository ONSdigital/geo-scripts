// A uniform grid index over points or bounding boxes (in lng/lat degrees).
// Queries return candidate item indices, in insertion order, which callers then
// test exactly. This replaces "test every item" loops that scale as n * m.
export class GridIndex {
  constructor(cellSize = 0.1) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  #cell(v) {
    return Math.floor(v / this.cellSize);
  }

  #key(cx, cy) {
    return `${cx}|${cy}`;
  }

  #add(cx, cy, i) {
    const key = this.#key(cx, cy);
    const cell = this.cells.get(key);
    if (cell) cell.push(i);
    else this.cells.set(key, [i]);
  }

  insertPoint(i, [x, y]) {
    this.#add(this.#cell(x), this.#cell(y), i);
  }

  insertBBox(i, [x0, y0, x1, y1]) {
    for (let cx = this.#cell(x0); cx <= this.#cell(x1); cx ++) {
      for (let cy = this.#cell(y0); cy <= this.#cell(y1); cy ++) this.#add(cx, cy, i);
    }
  }

  // Items whose cells overlap the bbox (points inside it, or boxes that may overlap it)
  queryBBox([x0, y0, x1, y1]) {
    const found = new Set();
    for (let cx = this.#cell(x0); cx <= this.#cell(x1); cx ++) {
      for (let cy = this.#cell(y0); cy <= this.#cell(y1); cy ++) {
        const cell = this.cells.get(this.#key(cx, cy));
        if (cell) for (const i of cell) found.add(i);
      }
    }
    return Array.from(found).sort((a, b) => a - b);
  }

  // Items in the point's cell (eg. boxes that may contain it)
  queryPoint([x, y]) {
    return [...(this.cells.get(this.#key(this.#cell(x), this.#cell(y))) || [])];
  }
}

export function pointIndex(points, cellSize) {
  const index = new GridIndex(cellSize);
  points.forEach((p, i) => index.insertPoint(i, p));
  return index;
}

export function bboxIndex(bboxes, cellSize) {
  const index = new GridIndex(cellSize);
  bboxes.forEach((b, i) => index.insertBBox(i, b));
  return index;
}

// Inclusive of the boundary, matching turf's booleanPointInPolygon default
export function pointInBBox([x, y], [x0, y0, x1, y1]) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// Pre-process a ring so that point tests only visit the edges in the point's
// horizontal band, instead of every edge. Uses exactly the same arithmetic as
// turf's inRing (v6.5), so results are identical, including on the boundary.
function prepareRing(ring) {
  if (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) {
    ring = ring.slice(0, ring.length - 1);
  }
  const n = ring.length;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of ring) {
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  const count = Math.min(Math.max(Math.ceil(n / 16), 1), 4096);
  const height = (y1 - y0) / count || 1;
  const bandOf = (y) => Math.min(Math.max(Math.floor((y - y0) / height), 0), count - 1);
  const bands = Array.from({length: count}, () => []);
  // Edges stored as [xi, yi, xj, yj], with i/j paired as in turf
  for (let i = 0, j = n - 1; i < n; j = i ++) {
    const edge = [ring[i][0], ring[i][1], ring[j][0], ring[j][1]];
    const b0 = bandOf(Math.min(edge[1], edge[3]));
    const b1 = bandOf(Math.max(edge[1], edge[3]));
    for (let b = b0; b <= b1; b ++) bands[b].push(edge);
  }
  return (pt, ignoreBoundary) => {
    // Edges entirely above or below the point can't intersect or touch it
    if (n === 0 || pt[1] < y0 || pt[1] > y1) return false;
    let isInside = false;
    for (const [xi, yi, xj, yj] of bands[bandOf(pt[1])]) {
      const onBoundary = pt[1] * (xi - xj) + yi * (xj - pt[0]) + yj * (pt[0] - xi) === 0 &&
        (xi - pt[0]) * (xj - pt[0]) <= 0 &&
        (yi - pt[1]) * (yj - pt[1]) <= 0;
      if (onBoundary) return !ignoreBoundary;
      const intersect = yi > pt[1] !== yj > pt[1] &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
      if (intersect) isInside = !isInside;
    }
    return isInside;
  };
}

// Signed area of a ring (in coordinate units): negative if clockwise
export function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i ++) sum += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  return -sum / 2;
}

function ringBounds(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

// Rebuild a Polygon/MultiPolygon from its rings using Esri's winding order (outer rings
// clockwise, holes anticlockwise), putting each hole in the smallest outer ring that
// contains it. The Geoportal's GeoJSON sometimes returns holes as separate polygons
// (eg. Nottingham inside Nottinghamshire). Correctly structured geometry is unchanged,
// and holes that aren't inside any outer ring are kept as polygons.
export function fixRings(geometry) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) return geometry;
  const rings = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates).flat(1);
  const outers = rings.filter(r => ringArea(r) < 0);
  if (outers.length === 0) return geometry;

  const polygons = outers.map(ring => ({
    rings: [ring],
    area: Math.abs(ringArea(ring)),
    bounds: ringBounds(ring),
    contains: preparePointInPolygon({type: "Polygon", coordinates: [ring]})
  }));
  for (const hole of rings.filter(r => ringArea(r) >= 0)) {
    const container = polygons
      .filter(p => p.contains && pointInBBox(hole[0], p.bounds) && p.contains(hole[0]))
      .sort((a, b) => a.area - b.area)[0];
    if (container) container.rings.push(hole);
    else polygons.push({rings: [hole]});
  }
  const coordinates = polygons.map(p => p.rings);
  return coordinates.length === 1 ? {type: "Polygon", coordinates: coordinates[0]} : {type: "MultiPolygon", coordinates};
}

// Returns a fast test equivalent to turf.booleanPointInPolygon(pt, geometry),
// for testing many points against the same Polygon or MultiPolygon
export function preparePointInPolygon(geometry, {ignoreBoundary = false} = {}) {
  const polys = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates)
    .map(rings => rings.map(prepareRing));
  return (pt) => {
    for (const [outer, ...holes] of polys) {
      if (outer(pt, ignoreBoundary) && !holes.some(hole => hole(pt, !ignoreBoundary))) return true;
    }
    return false;
  };
}
