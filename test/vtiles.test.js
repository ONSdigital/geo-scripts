import { test } from "node:test";
import assert from "node:assert/strict";
import { preparePolygons, findParents } from "../scripts/lib/vtiles.js";

const square = (areacd, x0, y0, size) => ({
  type: "Feature",
  properties: {areacd},
  geometry: {type: "Polygon", coordinates: [[[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size], [x0, y0]]]}
});

test("findParents takes the first parent type, in hierarchy order, that contains each area", () => {
  // A combined authority (E47) containing a county (E10) and part of the area outside it
  const polygonsByType = {
    E10: preparePolygons([square("E10000001", 0, 0, 2)]),
    E47: preparePolygons([square("E47000001", 0, 0, 4)])
  };
  const areas = [
    {areacd: "E07000001", centroid: [1, 1], parentTypes: ["E10", "E47", "E12"]}, // district in the county
    {areacd: "E06000001", centroid: [3, 3], parentTypes: ["E10", "E47", "E12"]}, // unitary outside the county
    {areacd: "E10000001", centroid: [1, 1], parentTypes: ["E47", "E12"]},        // the county itself
    {areacd: "E06000002", centroid: [9, 9], parentTypes: ["E10", "E47", "E12"]}  // outside everything
  ];
  assert.deepEqual(Object.fromEntries(findParents(areas, polygonsByType)), {
    E07000001: "E10000001",
    E06000001: "E47000001",
    E10000001: "E47000001"
  });
});
