// Script to ensure that centroids are all within their polygons
// findPolylabel() should now ensure this, but this script is retained as a failsafe
import { readdirSync } from "fs";
import { booleanPointInPolygon } from "@turf/turf";
import { readGzip } from "./utils.js";
import { dirs } from "../config/paths.js";

const geo_dir = dirs.geos;
const types = readdirSync(geo_dir).filter(t => t.match(/[EKNSW]{1}\d{2}/));

let total = 0;
let failed = 0;

for (const type of [...types].reverse()) {
  const files = readdirSync(`${geo_dir}/${type}`).filter(t => t.match(/^[EKNSW]{1}\d{8}/));
  for (const file of files) {
    total += 1;
    const path = `${geo_dir}/${type}/${file}`;
    const feature = JSON.parse(readGzip(path));
    const code = feature.properties.areacd;
    const pointInPoly = booleanPointInPolygon({type: "Point", coordinates: feature.properties.centroid}, feature);
    if (!pointInPoly) {
      failed += 1;
      console.log(`${code} failed!`);
    }
  }
}

console.log(`A total of ${failed.toLocaleString("en-GB")} (${(100 * (failed / total)).toFixed(1)}%) of ${total.toLocaleString("en-GB")} areas failed!`)