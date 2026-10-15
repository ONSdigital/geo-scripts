import { readFileSync, existsSync, createReadStream, writeFileSync } from "fs";
import zlib from "zlib";
import readline from "line-by-line";
import { bbox } from "@turf/turf";
import { csvParse, getValidBoundariesPath } from "./utils.js";
import { makeCensusLookup, compressCensusCodes } from "./lib/census.js";
import { pointIndex, pointInBBox, preparePointInPolygon } from "./lib/spatial.js";
import geo_config from "../config/geo-config.js";
import { files } from "../config/paths.js";
import { cli, selectGeos, isSelection } from "./lib/cli.js";

const startTime = new Date();

const geo_keys = ["msoa", "lsoa", "oa"];
const self_keys = ["ctry", "rgn"] // These non-changing codes can be their own lookups
const skip_keys = ["uk"]; // Don't do best-fit for UK

const usage = `Usage: npm run get-best-fits -- [--geo ltla,wd]
  --geo  only recalculate best-fits for these geographies, keeping the rest of the existing lookup files`;
const {opts, selected} = cli(usage, opts => selectGeos(geo_config, opts, {years: false}));

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
        const inPolygon = preparePointInPolygon(feature.geometry);
        // Only test the centroids in grid cells that overlap the area's bbox
        const codes = centroids.index.queryBBox(bounds)
          .map(j => centroids.features[j])
          .filter(c =>
            pointInBBox(c.geometry.coordinates, bounds) &&
            inPolygon(c.geometry.coordinates)
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

// "Frozen" lookup for Census 2021 geographies
console.log("Making census lookup...");
const census_lookup = makeCensusLookup(csvParse(readFileSync(files.censusLookup, {encoding: 'utf8', flag: 'r'})));

for (const key of geo_keys) {
  console.log(`Getting ${key} best-fits...`);
  const best_fits = {};
  const centroids = await getGeoJSON(files.centroids(key, 2021));
  centroids.index = pointIndex(centroids.features.map(f => f.geometry.coordinates), 0.05);
  for (const geo of selected.filter(g => ![...geo_keys, ...skip_keys].includes(g.key))) {
    for (const year of geo.years) {
      const path = getValidBoundariesPath(geo.key, `${year}`.slice(-2));
      await getBestFits(path, geo, centroids, census_lookup[key], best_fits, key);
    }
  }
  const outpath = files.bestFit(key);
  // With a selection, update the selected areas in the existing lookup
  const existing = isSelection(opts) && existsSync(outpath) ? JSON.parse(readFileSync(outpath, {encoding: 'utf8', flag: 'r'})) : {};
  writeFileSync(outpath, JSON.stringify({...existing, ...best_fits}));
  console.log(`Wrote ${outpath}!`);
}

const endTime = new Date();
const duration = Math.round((endTime - startTime) / 1000);
console.log(`Script completed in ${duration.toLocaleString()} seconds.`);
