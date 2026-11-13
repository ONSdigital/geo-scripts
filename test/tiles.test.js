import { test } from "node:test";
import assert from "node:assert/strict";
import { createTileSplitter } from "../scripts/lib/tiles.js";

// Lines in the format written by tippecanoe-decode
const feature = (cd) => JSON.stringify({type: "Feature", properties: {areacd: cd}, geometry: {type: "Point", coordinates: [0, 51]}});
const lines = [
  '{ "type": "FeatureCollection", "properties": {',
  '{ "type": "FeatureCollection", "properties": { "zoom": 12, "x": 2033, "y": 1373 }, "features": [',
  '{ "type": "FeatureCollection", "properties": { "layer": "boundaries", "version": 2, "extent": 4096 }, "features": [',
  feature("E07000148"),
  feature("E05000001"),
  '] }',
  '] }',
  '{ "type": "FeatureCollection", "properties": { "zoom": 12, "x": 2033, "y": 1374 }, "features": [',
  '] }',
  '{ "type": "FeatureCollection", "properties": { "zoom": 12, "x": 2034, "y": 1373 }, "features": [',
  feature("E07000149"),
  '] }',
  '] }'
];

test("splits decoded tiles, skipping empty ones and including the last tile", () => {
  const tiles = [];
  const splitter = createTileSplitter(tile => tiles.push(tile));
  for (const line of lines) splitter.line(line);
  splitter.end();

  assert.deepEqual(tiles.map(t => [t.x, t.y, t.features.map(f => f.properties.areacd)]), [
    [2033, 1373, ["E07000148", "E05000001"]],
    [2034, 1373, ["E07000149"]]
  ]);
});
