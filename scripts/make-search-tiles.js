import { readFileSync, writeFileSync, appendFileSync, createReadStream } from "fs";
import zlib from "zlib";
import readline from "line-by-line";
import geos from "../config/geo-config.js";
import { run, getValidBoundariesPath, writeGzip, clearTemp, mkdir, csvParse } from "./utils.js";

const sources = geos
  .filter(g => g.key !== "uk")
  .map(g => {
    const paths = g.years.map(year => getValidBoundariesPath(g.key, `${year}`.slice(-2), ["bgc", "bfc"])).reverse();
    const outpath = `./temp/${g.key}.json`;
    return {key: g.key, year: g.years.slice(-1)[0], paths, outpath};
  });

const geoTypeCodes = new Set(geos.map(g => g.codes).flat());

function processSourceFile(path, outpath, lookup, codes) {
  return new Promise((resolve) => {
    console.log(`Merging features from ${path}`);
    const lineReader = new readline(createReadStream(path).pipe(zlib.createGunzip()));

    lineReader.on('line', (line) => {
      lineReader.pause();
      const feature = JSON.parse(line);
      const areacd = feature.properties.areacd;

      if (!codes.has(areacd) && geoTypeCodes.has(areacd.slice(0, 3))) {
        codes.add(areacd);
        const lkp = lookup[areacd];
        if (lkp.start) feature.properties.start = lkp.start;
        if (lkp.end) feature.properties.end = lkp.end;
        appendFileSync(outpath, `${JSON.stringify(feature)}\n`);
      }

      lineReader.resume();
    });

    lineReader.on("end", async () => {
      resolve();
    });
  });
}

async function mergeSourceFiles(source, lookup) {
  const codes = new Set();
  writeFileSync(source.outpath, "");
  for (const path of source.paths) {
    await processSourceFile(path, source.outpath, lookup, codes);
  }
  console.log(`Zipping ${source.outpath}...`);
  await run(`gzip ${source.outpath}`);
}

function makeGeoJSONTiles(path, yr) {
  return new Promise((resolve) => {
    console.log(`Making GeoJSON tiles from ${path}...`);
    const lineReader = new readline(path);

    let currentTile;

    function writeTile(tile) {
      if (tile && tile.json.features.length > 0) {
        mkdir(tile.dir);
        writeGzip(tile.path, JSON.stringify(tile.json));
        console.log(`Wrote ${tile.path}`);
      }
    }

    lineReader.on('line', (line) => {
      lineReader.pause();

      if (line.startsWith('{ "type": "FeatureCollection", "properties": { "zoom":')) {
        writeTile(currentTile);
        // const z = +line.match(/(?<="zoom":\s)\d+(?=,)/)[0];
        const x = +line.match(/(?<="x":\s)\d+(?=,)/)[0];
        const y = +line.match(/(?<="y":\s)\d+(?=\s)/)[0];
        const dir = `./output/search${yr}/${x}`;
        const path = `${dir}/${y}.json`;
        const json = {type: "FeatureCollection", features: []};
        currentTile = {dir, path, json};
      }

      let feature;

      try {
        feature = JSON.parse(line);
      }
      catch {
        // Suppress parsing errors
      }

      if (feature?.type === "Feature") {
        currentTile.json.features.push(feature);
      }

      lineReader.resume();
    });

    lineReader.on("end", async () => {
      // The last tile has no following header to trigger a write
      writeTile(currentTile);
      resolve();
    });
  });
}

// Load lookup data
const lookup_path = "./input/lookups/lookup.csv";
const lookup_raw = readFileSync(lookup_path, {encoding: 'utf8', flag: 'r'});
const lookup_data = csvParse(lookup_raw);
const lookup = {};
for (const d of lookup_data) lookup[d.areacd] = d;

// Merge all features for all years for each geo group
for (const source of sources) await mergeSourceFiles(source, lookup);

const yr = `${Math.max(...sources.map(l => l.year).flat())}`.slice(-2);
const output = `./temp/search${yr}.mbtiles`;

const mbtilesCmd = `tippecanoe -o ${output} --read-parallel --detect-shared-borders --no-feature-limit -Z 12 -z 12 ${sources.map(s => `-L boundaries:${s.outpath}.gz`).join(" ")}`;

console.log("Generating search tiles...");
await run(mbtilesCmd);

const json_path = `./temp/search${yr}.json`;

console.log("Unpacking search tiles...");
const unpackCmd = `tippecanoe-decode ${output} > ${json_path}`;
await run(unpackCmd);

await makeGeoJSONTiles(json_path, yr);

clearTemp();
