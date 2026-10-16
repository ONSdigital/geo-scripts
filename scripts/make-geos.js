import { readFileSync, rmSync, createReadStream } from "fs";
import zlib from "zlib";
import readline from "line-by-line";
import { writeGzip, csvParse, mkdir } from "./utils.js";
import geos from "../config/geo-config.js";
import types from "../config/geo-types.js";
import { dirs, files } from "../config/paths.js";
import { cli, selectGeos } from "./lib/cli.js";

const usage = `Usage: npm run make-geos -- [--geo ltla,wd] [--clean]
  --geo    only generate files for these geographies (from config/geo-config.js)
  --clean  delete existing files for the selected geographies first (removes areas no longer in the lookup)`;
const {opts, selected} = cli(usage, opts => selectGeos(geos, opts, {years: false}));

const startTime = new Date();

// Areas written so far: each area is written once, from the newest year it appears in
const written = new Set();


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

// Rows of the lookup grouped by a column, in their original order
function groupBy(data, key) {
  const groups = new Map();
  for (const d of data) {
    if (!d[key]) continue;
    const group = groups.get(d[key]);
    if (group) group.push(d);
    else groups.set(d[key], [d]);
  }
  return groups;
}

function getChildren(lookup, by_parent, code) {
  let children = (by_parent.get(code) || []).filter(d => childYearValid(lookup[code], d));
  return children.map(child => propsToNames(child))
    .sort((a, b) => a.areacd.localeCompare(b.areacd));
}

function getSuperseded(by_successor, code) {
  let superseded = by_successor.get(code) || [];
  return superseded.map(sup => propsToNames(sup))
    .sort((a, b) => a.areacd.localeCompare(b.areacd));
}

function makeGeo(geo, year, indexes, lookup, census_lookup) {
  return new Promise((resolve) => {
    const yr = String(year).slice(-2);
    const detail = geo.detail || "bgc";
    const dp = detail === "bfc" ? 6 : detail === "buc" ? 4 : 5;
    const geo_path = files.boundary(geo.key, year, detail);

    console.log(`Generating geo files from ${geo_path}`);
    const lineReader = new readline(createReadStream(geo_path).pipe(zlib.createGunzip()));

    lineReader.on('line', (line) => {
      lineReader.pause();
      const feature = JSON.parse(line);
      const areacd = feature.properties.areacd;
      const typecd = areacd.slice(0, 3);
      const dir = `${dirs.geos}/${typecd}`;
      const path = `${dir}/${areacd}.json`;

      if (!written.has(areacd) && geo.codes.includes(typecd)) {
        written.add(areacd);
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
          props.replaces = getSuperseded(indexes.by_successor, areacd);
        }

        // Add parents and children. Virtual geographies outside the hierarchy (eg. Great
        // Britain) take them from their config: their member countries, and the UK.
        const outside = geo.virtual?.parent;
        props.children = outside ?
          geo.virtual.members.map(cd => propsToNames(lookup[cd])).sort((a, b) => a.areacd.localeCompare(b.areacd)) :
          getChildren(lookup, indexes.by_parent, areacd);
        props.child_typecds = props.children[0] ?
          Array.from(new Set(props.children.map(c => c.areacd.slice(0, 3)))).sort((a, b) => a.localeCompare(b)) :
          [];
        props.parents = outside ?
          [propsToNames(lookup[geo.virtual.parent], ["start", "end"])] :
          getParents(lookup, areacd);

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

// Load source data
const lookup_path = files.lookup;
const lookup_raw = readFileSync(lookup_path, {encoding: 'utf8', flag: 'r'});
const lookup_data = csvParse(lookup_raw)
  .map(d => ({
    ...d,
    centroid: d.centroid.split("|").map(coord => +coord),
    bounds: d.bounds.split("|").map(coord => +coord)
  }));
const lookup = {};
for (const d of lookup_data) lookup[d.areacd] = d;
const indexes = {
  by_parent: groupBy(lookup_data, "parentcd"),
  by_successor: groupBy(lookup_data, "successorcd")
};

// Load census lookups
const census_lookup = {};
for (const key of ["oa", "lsoa", "msoa"]) {
  const path = files.bestFit(key);
  census_lookup[key] = JSON.parse(readFileSync(path, {encoding: 'utf8', flag: 'r'}));
}

// Make output directory if needed, and remove old files if requested
mkdir(dirs.geos);
if (opts.clean) {
  for (const code of selected.flatMap(g => g.codes)) {
    console.log(`Removing ${dirs.geos}/${code}`);
    rmSync(`${dirs.geos}/${code}`, {recursive: true, force: true});
  }
}

// Generate geo files
for (const geo of selected) {
  for (let year of [...geo.years].reverse()) {
    await makeGeo(geo, year, indexes, lookup, census_lookup);
  }
}

const endTime = new Date();
const duration = Math.round((endTime - startTime) / 1000);
console.log(`Script completed in ${duration.toLocaleString()} seconds.`);
