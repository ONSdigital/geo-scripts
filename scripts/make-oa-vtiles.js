// This script generates an OA vector map tileset where the smallest areas are
// merged into their parents at lower zooms levels, retaining the area code of
// the largest merged area along with the parent area code.

import { readFileSync, writeFileSync, appendFileSync, existsSync, createReadStream } from "fs";
import zlib from "zlib";
import readline from "line-by-line";
import mapshaper from "mapshaper";
import { csvParse, makeLookup, run, clearTemp } from "./utils.js";
import { dirs } from "../config/paths.js";

const oa_bounds_file = "oa21_bgc";
const oa_lookup_file = "lookup_vtiles_oa21";
const msoa_bounds_file = "msoa21_bsc";
const msoa_lookup_file = "lookup_vtiles_msoa21";

const zooms = [
  {min: 12, detail: "bfc"},
  {min: 11, max: 10, detail: "bgc"},
  {min: 9, detail: "bgc0"},
  {min: 8, detail: "bgc1"},
  {min: 7, detail: "bgc2"},
  {min: 6, detail: "bgc3"},
  {min: 5, detail: "bsc4"},
];

function runMapshaper(cmd) {
  return new Promise((resolve) => {
    mapshaper.runCommandsXL(cmd, () => resolve());
  });
}

function mergeLookup(geo_file, lookup_file) {
  return new Promise((resolve) => {
    const lookup_data = csvParse(readFileSync(`${dirs.lookups}/${lookup_file}.csv`, {encoding: 'utf8', flag: 'r'}));
    const lookup = makeLookup(lookup_data);
    const input = `${dirs.boundaries}/${geo_file}.json.gz`;
    const output = `./temp/${geo_file}.json`;

    if (!existsSync(output)) {
      console.log(`Merging lookup to ${output}`);
      writeFileSync(output, "");

      const lineReader = new readline(createReadStream(input).pipe(zlib.createGunzip()));

      lineReader.on('line', (line) => {
        lineReader.pause();
        const feature = JSON.parse(line);
        const areacd = feature.properties.areacd;
        feature.properties = lookup[areacd];
        appendFileSync(output, `${JSON.stringify(feature)}\n`);

        lineReader.resume();
      });

      lineReader.on("end", async () => {
        run(`ogr2ogr ${output.replace(".json", ".geojson")} ${output}`).then(() => resolve());
      });
    } else {
      console.log(`File already exists ${output}`);
      resolve();
    }
  });
}

await mergeLookup(oa_bounds_file, oa_lookup_file);
await mergeLookup(msoa_bounds_file, msoa_lookup_file);

let output;

output = "./temp/oa21_bsc4.json";
if (!existsSync(`${output}.gz`)) {
  await runMapshaper(`-i ./temp/${msoa_bounds_file}.geojson -rename-fields areacd=childcd,parentcd=areacd -o ${output} format=geojson precision=0.00001 ndjson gzip`);
  console.log(`Wrote ${output}.gz`);
}
else console.log(`File already exists ${output}`);

for (let i = 0; i < 4; i ++) {
  const output = `./temp/oa21_bgc${i}.json`;
  if (!existsSync(`${output}.gz`)) {
    await runMapshaper(`-i ./temp/${oa_bounds_file}.geojson -filter-fields areacd${i},parentcd${i} -rename-fields areacd=areacd${i},parentcd=parentcd${i} -dissolve2 areacd,parentcd -o ${output} format=geojson precision=0.00001 ndjson gzip`);
    console.log(`Wrote ${output}.gz`);
  }
  else console.log(`File already exists ${output}.gz`);
}

const steps = [];
for (const zoom of zooms) {
  const max = zoom.max ? zoom.max : zoom.min;
  const input = `./${zoom.min < 10 ? "temp" : "input/boundaries"}/oa21_${zoom.detail}.json.gz`;
  const output = `./temp/oa21_z${zoom.min}-${max}.mbtiles`;
  steps.push({cmd: `tippecanoe -o ${output} --read-parallel --detect-shared-borders --no-feature-limit --no-tile-size-limit -Z ${max} -z ${zoom.min} -l boundaries ${input}`, output});
}
output = `${dirs.vtiles}/oa21.mbtiles`;
steps.push({cmd: `tile-join -o ${output} --no-tile-size-limit ${steps.map(s => s.output).join(" ")}`, output});

console.log("Making vector tiles");
for (const step of steps) {
  if (!existsSync(step.output)) {
    await run(step.cmd);
    console.log(`Wrote ${step.output}`);
  }
  else console.log(`File already exists ${step.output}`);
}

if (steps.map(s => s.output).every(path => existsSync(path))) clearTemp();