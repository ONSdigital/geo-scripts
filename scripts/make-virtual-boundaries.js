// Makes boundary files for virtual geographies (eg. the UK, Great Britain, England and
// Wales), which have no published boundaries, by merging their member countries.
// One file is made for every year and detail level of the geography they're made from,
// eg. ./input/boundaries/gb22_bgc.json.gz from ctry22_bgc.json.gz.
// Run after download-files and before get-metadata.
import { existsSync, renameSync } from "fs";
import mapshaper from "mapshaper";
import geo_config from "../config/geo-config.js";
import { files } from "../config/paths.js";
import { readGzip, writeGzip } from "./utils.js";
import { cli, rejectSelection } from "./lib/cli.js";

const usage = `Usage: npm run make-virtual-boundaries -- [--force]
  --force  remake files that already exist`;
const {opts} = cli(usage);
rejectSelection(opts, "virtual boundaries are always made for every year of the geography they come from");

const DETAILS = ["bfe", "bfc", "bgc", "bsc", "buc"];
// Coordinate precision, matching the downloaded files (see download-files)
const precision = (detail) => detail.startsWith("bf") ? 0.000001 : detail === "buc" ? 0.0001 : 0.00001;

function dissolve(features, detail) {
  return new Promise((resolve, reject) => {
    const input = {type: "FeatureCollection", features: features.map(f => ({...f, properties: {}}))};
    mapshaper.applyCommands(
      `-i input.json -dissolve2 -o output.json format=geojson geojson-type=FeatureCollection precision=${precision(detail)}`,
      {"input.json": input},
      (err, output) => err ? reject(err) : resolve(JSON.parse(output["output.json"]).features[0].geometry)
    );
  });
}

let made = 0;
for (const geo of geo_config.filter(g => g.virtual)) {
  const {from, code, name, namew, members} = geo.virtual;
  for (const year of geo.years) {
    for (const detail of DETAILS) {
      const source = files.boundary(from, year, detail);
      const output = files.boundary(geo.key, year, detail);
      if (!existsSync(source)) continue;
      if (existsSync(output) && !opts.force) {
        console.log(`${output} already exists`);
        continue;
      }
      const features = readGzip(source).trim().split("\n").map(line => JSON.parse(line))
        .filter(f => members.includes(f.properties.areacd));
      const missing = members.filter(cd => !features.some(f => f.properties.areacd === cd));
      if (missing.length) throw new Error(`${source} is missing ${missing.join(", ")}, needed for ${code}`);

      console.log(`Merging ${members.join(", ")} from ${source}`);
      const geometry = await dissolve(features, detail);
      const feature = {type: "Feature", properties: {areacd: code, areanm: name, areanmw: namew}, geometry};
      // Write under a temporary name, so an interrupted run never leaves a partial file
      writeGzip(`${output}.part`, `${JSON.stringify(feature)}\n`);
      renameSync(`${output}.part`, output);
      console.log(`Wrote ${output}`);
      made ++;
    }
  }
}
console.log(`Made ${made} virtual boundary file(s).`);
