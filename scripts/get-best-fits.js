import { existsSync, readFileSync, createReadStream, writeFileSync } from "fs";
import zlib from "zlib";
import readline from "line-by-line";
import { bbox, bboxPolygon, booleanPointInPolygon } from "@turf/turf";
import { csvParse, getValidBoundariesPath } from "./utils.js";
import geo_config from "../config/geo-config.js";
import { files } from "../config/paths.js";

const startTime = new Date();

const geo_keys = ["msoa", "lsoa", "oa"];
const self_keys = ["ctry", "rgn"] // These non-changing codes can be their own lookups
const skip_keys = ["uk"]; // Don't do best-fit for UK

async function getGeoJSON(path) {
  return new Promise((resolve) => {
    console.log(`Getting GeoJSON from ${path}`);
    const geojson = {type: "FeatureCollection", features: []};

    const lineReader = new readline(createReadStream(path).pipe(zlib.createGunzip()));

    lineReader.on('line', (line) => {
      lineReader.pause();
      const feature = JSON.parse(line);
      if (feature?.type) {
        geojson.features.push(feature);
      }
      lineReader.resume();
    });

    lineReader.on("end", async () => {
      resolve(geojson);
    });
  });
}

// "Frozen" lookup for Census 2021 geographies
function makeCensusLookup() {
  console.log("Making census lookup...");
  const path = files.censusLookup;
  const data_raw = readFileSync(path, {encoding: 'utf8', flag: 'r'});
  const data = csvParse(data_raw);
  const cols = ["oa21cd", "lsoa21cd", "msoa21cd", "ltla22cd"];

  const lkp = {};
  for (const key of ["oa", "lsoa", "msoa"]) {
    const col = `${key}21cd`;
    const parent_cols = cols.slice(cols.indexOf(col) + 1);

    let filtered_data = [];
    if (key === "oa") filtered_data = data;
    else {
      const unique_cds = new Set();
      const filtered_cols = [col, ...parent_cols];
      for (const d of data) {
        if (!unique_cds.has(d[col])) {
          unique_cds.add(d[col]);
          const row = {};
          for (const c of filtered_cols) row[c] = d[c];
          filtered_data.push(row);
        }
      }
    }
    const lookup = {};
    const counts = {};
    for (const d of filtered_data) {
      lookup[d[col]] = d;
      for (let key of parent_cols) {
        if (!counts[d[key]]) counts[d[key]] = 0;
        counts[d[key]] ++;
      }
    }
    lkp[key] = {lookup, counts};
  }
  
  return lkp;
}

function compressCensusCodes(oacds, c_lkp, type) {
  let oas = oacds.map(cd => c_lkp.lookup[cd]);
  const typecd = `${type}21cd`;
  const types = ["oa21cd", "lsoa21cd", "msoa21cd", "ltla22cd"];
  const codes = [];
  while (oas.length > 0) {
    const oa = oas[0];
    let found = false;
    for (const key of types.slice(types.indexOf(typecd) + 1).reverse()) {
      if (!codes.includes(oa[key])) {
        if (oas.filter(d => d[key] === oa[key]).length === c_lkp.counts[oa[key]]) {
          codes.push(oa[key]);
          oas = oas.filter(d => d[key] !== oa[key]);
          found = true;
          break;
        }
      }
    }
    if (!found) codes.push(oas.shift()[typecd]);
  }
  return codes.sort((a, b) => a.localeCompare(b));
}

async function getBestFits(path, geo, centroids, c_lkp, best_fits, type) {
  return new Promise((resolve) => {
    console.log(`Getting ${type} best-fits for geographies in ${path}...`);

    let i = 0;

    const lineReader = new readline(createReadStream(path).pipe(zlib.createGunzip()));

    lineReader.on('line', (line) => {
      lineReader.pause();
      const feature = JSON.parse(line);
      const cd = feature?.properties?.areacd;
      if (self_keys.includes(geo.key)) best_fits[cd] = [cd];
      if (feature && !["K", "N", "S"].includes(cd[0]) && !best_fits[cd]) {
        const bounds = bbox(feature);
        const poly = bboxPolygon(bounds);
        const codes = centroids.features.filter(c =>
          booleanPointInPolygon(c.geometry, poly.geometry) &&
          booleanPointInPolygon(c.geometry, feature.geometry)
        ).map(p => p.properties.areacd);
        best_fits[cd] = compressCensusCodes(codes, c_lkp, type);
        i ++;
        if (i % 100 === 0) console.log(`Calculated best-fits for ${i.toLocaleString()} areas...`);
      }
      lineReader.resume();
    });

    lineReader.on("end", async () => {
      console.log(`Calculated best-fits for ${i.toLocaleString()} areas...`);
      resolve();
    });
  });
}

const census_lookup = makeCensusLookup();

for (const key of geo_keys) {
  console.log(`Getting ${key} best-fits...`);
  const best_fits = {};
  const centroids_path = files.centroids(key, 2021);
  const centroids = await getGeoJSON(centroids_path);
  for (const geo of geo_config.filter(g => ![...geo_keys, ...skip_keys].includes(g.key))) {
    for (const year of geo.years) {
      const path = getValidBoundariesPath(geo.key, `${year}`.slice(-2));
      await getBestFits(path, geo, centroids, census_lookup[key], best_fits, key);
    }
  }
  const outpath = files.bestFit(key);
  writeFileSync(outpath, JSON.stringify(best_fits));
  console.log(`Wrote ${outpath}!`);
}

const endTime = new Date();
const duration = Math.round((endTime - startTime) / 1000);
console.log(`Script completed in ${duration.toLocaleString()} seconds.`);
