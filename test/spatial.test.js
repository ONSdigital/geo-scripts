import { test } from "node:test";
import assert from "node:assert/strict";
import { booleanPointInPolygon } from "@turf/turf";
import { pointIndex, bboxIndex, pointInBBox, preparePointInPolygon } from "../scripts/lib/spatial.js";

// Deterministic pseudo-random numbers, so failures are reproducible
function random(seed = 1) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

test("pointIndex.queryBBox finds the same points as a brute-force search, in order", () => {
  const rand = random(42);
  const points = Array.from({length: 2000}, () => [rand() * 4 - 2, rand() * 4 + 50]);
  const index = pointIndex(points, 0.1);
  for (let i = 0; i < 50; i ++) {
    const x = rand() * 4 - 2, y = rand() * 4 + 50;
    const bbox = [x, y, x + rand(), y + rand()];
    const expected = points.map((p, j) => j).filter(j => pointInBBox(points[j], bbox));
    const found = index.queryBBox(bbox).filter(j => pointInBBox(points[j], bbox));
    assert.deepEqual(found, expected);
  }
});

test("bboxIndex.queryPoint returns every box that contains the point", () => {
  const rand = random(7);
  const boxes = Array.from({length: 500}, () => {
    const x = rand() * 10, y = rand() * 10;
    return [x, y, x + rand() * 2, y + rand() * 2];
  });
  const index = bboxIndex(boxes, 0.5);
  for (let i = 0; i < 200; i ++) {
    const pt = [rand() * 10, rand() * 10];
    const expected = boxes.map((b, j) => j).filter(j => pointInBBox(pt, boxes[j]));
    const found = index.queryPoint(pt).filter(j => pointInBBox(pt, boxes[j]));
    assert.deepEqual(found, expected);
  }
});

test("GridIndex handles negative coordinates and points on cell edges", () => {
  const points = [[-1, -1], [0, 0], [1, 1], [-0.5, 0.5]];
  const index = pointIndex(points, 1);
  // Queries return candidates from overlapping cells, which callers filter exactly
  const query = (bbox) => index.queryBBox(bbox).filter(i => pointInBBox(points[i], bbox));
  assert.deepEqual(query([-1, -1, 1, 1]), [0, 1, 2, 3]);
  assert.deepEqual(query([-0.5, -0.5, 0.5, 0.5]), [1, 3]);
  assert.deepEqual(query([0.1, 0.1, 0.9, 0.9]), []);
});

const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
const geometries = {
  "polygon": {type: "Polygon", coordinates: [square]},
  "polygon with hole": {type: "Polygon", coordinates: [square, hole]},
  "unclosed ring": {type: "Polygon", coordinates: [square.slice(0, -1)]},
  "multipolygon": {type: "MultiPolygon", coordinates: [[square], [[[20, 20], [25, 20], [22, 27], [20, 20]]]]},
  "concave": {type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [5, 3], [0, 10], [0, 0]]]}
};

for (const [name, geometry] of Object.entries(geometries)) {
  test(`preparePointInPolygon matches turf for a ${name}`, () => {
    const rand = random(name.length);
    const points = [
      // Random points, vertices, edge points and hole boundaries
      ...Array.from({length: 2000}, () => [rand() * 30 - 2, rand() * 30 - 2]),
      [0, 0], [10, 0], [5, 0], [0, 5], [10, 10], [4, 4], [5, 4], [6, 5], [5, 5], [5, 3], [2.5, 6.5],
      [20, 20], [22, 27], [21, 23.5], [-1, 5], [11, 5], [5, -1], [5, 11]
    ];
    for (const ignoreBoundary of [false, true]) {
      const test = preparePointInPolygon(geometry, {ignoreBoundary});
      for (const pt of points) {
        assert.equal(test(pt), booleanPointInPolygon(pt, geometry, {ignoreBoundary}), `point ${pt} (ignoreBoundary: ${ignoreBoundary})`);
      }
    }
  });
}

test("fixRings puts holes stored as separate polygons back into their outer ring", async () => {
  const { fixRings, ringArea } = await import("../scripts/lib/spatial.js");
  // Esri winding: outer rings clockwise, holes anticlockwise
  const outer = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
  const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  const island = [[20, 20], [20, 22], [22, 22], [22, 20], [20, 20]];
  const islandInHole = [[4.5, 4.5], [4.5, 5.5], [5.5, 5.5], [5.5, 4.5], [4.5, 4.5]];
  assert.ok(ringArea(outer) < 0 && ringArea(hole) > 0);

  // A hole returned as a separate polygon (eg. Nottingham in Nottinghamshire)
  assert.deepEqual(fixRings({type: "MultiPolygon", coordinates: [[outer], [island], [hole]]}),
    {type: "MultiPolygon", coordinates: [[outer, hole], [island]]});
  // An island inside the hole stays a separate polygon, and the hole goes in the smallest outer ring around it
  assert.deepEqual(fixRings({type: "MultiPolygon", coordinates: [[outer], [islandInHole], [hole]]}),
    {type: "MultiPolygon", coordinates: [[outer, hole], [islandInHole]]});
  // Correct geometry is unchanged, and a single polygon is returned as a Polygon
  assert.deepEqual(fixRings({type: "Polygon", coordinates: [outer, hole]}), {type: "Polygon", coordinates: [outer, hole]});
  assert.deepEqual(fixRings({type: "MultiPolygon", coordinates: [[outer, hole]]}), {type: "Polygon", coordinates: [outer, hole]});
  // An anticlockwise ring that isn't inside anything is kept as a polygon
  const reversedIsland = [...island].reverse();
  assert.deepEqual(fixRings({type: "MultiPolygon", coordinates: [[outer], [reversedIsland]]}),
    {type: "MultiPolygon", coordinates: [[outer], [reversedIsland]]});
  // Points and lines are untouched
  assert.deepEqual(fixRings({type: "Point", coordinates: [1, 2]}), {type: "Point", coordinates: [1, 2]});
});
