import { readFileSync, existsSync, createReadStream } from "fs";
import zlib from "zlib";
import readline from "line-by-line";
import mapshaper from "mapshaper";
import { bbox } from "@turf/turf";
import { readGzip, writeGzip, csvParse, findPolylabel, round, roundAll, mkdir } from "./utils.js";
import geos from "../config/geo-config.js";
import types from "../config/geo-types.js";

const startTime = new Date();

const dirs = ["geos", "cm-geos"];

function propsToNames(props, extraCols = []) {
  const newprops = {areacd: props.areacd};
  for (const key of ["areanm", "areanmw", "hclnm", "hclnmw", ...extraCols]) {
    if (props[key]) newprops[key] = props[key];
  }
  return newprops;
}

function getParents(lookup, code, parents = []) {
  let parentcd = lookup[code]?.parentcd;
  if (parentcd) {
    let parent = propsToNames(lookup[parentcd], ["start", "end"]);
    return getParents(lookup, parentcd, [...parents, parent]);
  } else {
    return parents;
  }
}

function childYearValid(parent, child) {
  const year = parent.end;
  if (!year && child.end) return false;
  if (year && child.end && child.end < year) return false;
  if (year && child.start && child.start > year) return false;
  return true;
}

function getChildren(lookup, lookup_data, code) {
  let children = lookup_data.filter(d => d.parentcd === code && childYearValid(lookup[code], d));
  return children.map(child => propsToNames(child))
    .sort((a, b) => a.areacd.localeCompare(b.areacd));
}

function getSuperseded(lookup_data, code) {
  let superseded = lookup_data.filter(d => d.successorcd === code);
  return superseded.map(sup => propsToNames(sup))
    .sort((a, b) => a.areacd.localeCompare(b.areacd));
}

function makeGeo(geo, year, lookup_data, lookup, census_lookup) {
  return new Promise((resolve) => {
    const yr = String(year).slice(-2);
    const detail = geo.detail || "bgc";
    const dp = detail === "bfc" ? 6 : detail === "buc" ? 4 : 5;
    const geo_path = `./input/boundaries/${geo.key}${yr}_${detail}.json.gz`;

    console.log(`Generating geo files from ${geo_path}`);
    const lineReader = new readline(createReadStream(geo_path).pipe(zlib.createGunzip()));

    lineReader.on('line', (line) => {
      lineReader.pause();
      const feature = JSON.parse(line);
      const areacd = feature.properties.areacd;
      const typecd = areacd.slice(0, 3);
      const dir = `./output/geos/${typecd}`;
      const path = `${dir}/${areacd}.json`;

      if (!existsSync(path) && geo.codes.includes(typecd)) {
        // Make simple props
        const lkp = lookup[areacd];
        const props = propsToNames(
          lkp,
          ["bounds", "centroid", "areakm2", "start", "end"]
        );

        // Add additional props
        props.groupcd = geo.key;
        props.groupnm = geo.label;
        props.typecd = typecd;
        props.typenm = types[props.typecd] || geo.label;

        // Add successor for terminated geographies
        if (lkp.successorcd) {
          props.successor = propsToNames(lookup[lkp.successorcd]);
        }

        // Add superseded geographies for new geographies
        if (lkp.start) {
          props.replaces = getSuperseded(lookup_data, areacd);
        }

        // Add parents and children
        props.children = getChildren(lookup, lookup_data, areacd);
        props.child_typecds = props.children[0] ?
          Array.from(new Set(props.children.map(c => c.areacd.slice(0, 3)))).sort((a, b) => a.localeCompare(b)) :
          [];
        props.parents = getParents(lookup, areacd);

        // Add census best-fit lookups
        const keys = ["oa", "lsoa", "msoa"];
        for (const key of keys) {
          if (keys.includes(geo.key) && keys.indexOf(geo.key) >= keys.indexOf(key)) props[`${key}21cds`] = [areacd];
          else if (census_lookup?.[key]?.[areacd]?.[0]) props[`${key}21cds`] = census_lookup[key][areacd];
        }

        feature.properties = props;

        // Create directory if needed
        mkdir(dir);

        // Write gzipped file
        writeGzip(path, JSON.stringify(feature));
        console.log(`Wrote ${path}`);
      } else {
        console.log(`Skipped ${areacd}`);
      }

      lineReader.resume();
    });

    lineReader.on("end", async () => {
      resolve();
    });
  });
}

function makeMergedGeo(props, childcds) {
  return new Promise((resolve) => {
    console.log(`Creating merged geography ${props.areanm} (${props.areacd}) from ${childcds.join(", ")}`);
    const geojson = {type: "FeatureCollection", features: []};
    const ft = [];
    for (const ccd of childcds) {
      const path = `./output/geos/${ccd.slice(0, 3)}/${ccd}.json`;
      const feature = JSON.parse(readGzip(path));
      // Keep the child's own properties before overwriting areacd for the dissolve
      ft.push({...feature.properties});
      feature.properties = {areacd: props.areacd};
      geojson.features.push(feature);
    }

    mapshaper.applyCommands("-i input.geojson -dissolve2 fields=areacd -o output.geojson", {"input.geojson": geojson}, (err, output) => {
      if (err) throw err;
      const merged = JSON.parse(output["output.geojson"]).features[0];

      if (!props.groupcd) props.groupcd = null;
      if (!props.groupnm) props.groupnm = props.areanm.toLowerCase();
      props.typecd = props.areacd.slice(0, 3);
      if (!props.typenm) props.typenm = props.areanm.toLowerCase();
      props.areakm2 = round(ft.reduce((sum, f) => sum + (f.areakm2 || 0), 0), 4);
      props.bounds = bbox(merged);
      props.centroid = roundAll(findPolylabel(merged));
      props.children = ft.map(f => propsToNames(f));
      props.child_typecds = Array.from(new Set(ft.map(f => f.areacd.slice(0, 3)))).sort((a, b) => a.localeCompare(b));
      props.parents = ft[0].parents;

      const outdir = `./output/geos/${props.areacd.slice(0, 3)}`;
      mkdir(outdir);

      const outpath = `${outdir}/${props.areacd}.json`;
      const feature = {type: "Feature", properties: props, geometry: merged.geometry};

      writeGzip(outpath, JSON.stringify(feature));
      console.log(`Wrote merged geography to ${outpath}`);
      resolve();
    });
  });
}

// Load source data
const lookup_path = "./input/lookups/lookup.csv";
const lookup_raw = readFileSync(lookup_path, {encoding: 'utf8', flag: 'r'});
const lookup_data = csvParse(lookup_raw)
  .map(d => ({
    ...d,
    centroid: d.centroid.split("|").map(coord => +coord),
    bounds: d.bounds.split("|").map(coord => +coord)
  }));
const lookup = {};
for (const d of lookup_data) lookup[d.areacd] = d;

// Load census lookups
const census_lookup = {};
for (const key of ["oa", "lsoa", "msoa"]) {
  const path = `./input/lookups/lookup_bestfit_${key}21.json`;
  census_lookup[key] = JSON.parse(readFileSync(path, {encoding: 'utf8', flag: 'r'}));
}

// Make directories if needed
for (const dir of dirs) {
  const path = `./output/${dir}`;
  mkdir(path);
}

// Generate geo files
for (const geo of geos) {
  for (let year of [...geo.years].reverse()) {
    await makeGeo(geo, year, lookup_data, lookup, census_lookup);
  }
}

// Make England and Wales file
await makeMergedGeo(
  {areacd: "K04000001", areanm: "England and Wales", areanmw: "Cymru a Lloegr", groupcd: "ew"},
  ["E92000001", "W92000004"]
);

const endTime = new Date();
const duration = Math.round((endTime - startTime) / 1000);
console.log(`Script completed in ${duration.toLocaleString()} seconds.`);
