// Streaming clean-up of downloaded boundary features
import { createWriteStream } from "fs";
import readline from "line-by-line";
import { fixRings } from "./spatial.js";

// Rename properties to areacd/areanm/areanmw (trimmed, blank names dropped), and repair
// holes stored as separate polygons (see fixRings)
export function cleanFeature(feature, fields) {
  const props = {};
  for (const field of fields) {
    const value = feature.properties[field.key];
    const trimmed = typeof value === "string" ? value.trim() : value;
    if (trimmed) props[field.label] = trimmed;
  }
  return {type: "Feature", properties: props, geometry: fixRings(feature.geometry)};
}

// Read a GeoJSON FeatureCollection written by ogr2ogr (one feature per line) and write
// cleaned features as GeoJSONSeq. Streams line by line, as some files are several GB.
// Returns the number of features.
export function writeCleanFeatures(input, output, fields) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(output);
    const lines = new readline(input);
    let count = 0;
    lines.on("line", (line) => {
      if (!line.startsWith('{ "type": "Feature"')) return;
      const feature = JSON.parse(line.replace(/,\s*$/, ""));
      count ++;
      if (!out.write(`${JSON.stringify(cleanFeature(feature, fields))}\n`)) {
        lines.pause();
        out.once("drain", () => lines.resume());
      }
    });
    lines.on("error", reject);
    lines.on("end", () => out.end());
    out.on("finish", () => resolve(count));
    out.on("error", reject);
  });
}
