import { existsSync, rmSync, readFileSync, writeFileSync } from "fs";
import { csvFormat } from "d3-dsv";
import { run, clearTemp, mkdir, csvParse, readGzip, getValidBoundariesPath } from "./utils.js";
import tilesets from "../config/vtiles-config.js";
import zoom_detail from "../config/vtiles-detail.js";
import geo_config from "../config/geo-config.js";
import { dirs, files, yy } from "../config/paths.js";
import { cli, selectTilesets } from "./lib/cli.js";
import { preparePolygons, findParents } from "./lib/vtiles.js";

const usage = `Usage: npm run make-vtiles -- [--geo la,wd] [--year 2025] [--force]
  --geo, --year  only make these tilesets (keys and years from config/vtiles-config.js)
  --force        remake tilesets that already exist`;
const {opts, selected} = cli(usage, opts => selectTilesets(tilesets, opts));

// const maxzoom = 12;
const dir = dirs.vtiles;

let outputs = [];

// Metadata for a tileset version, as a CSV to join to its features by areacd.
// {flag: "cauth"} sets cauth=true on areas whose parent, in the tileset's year, is one of
// the tileset's "cauth" areas (eg. local authorities in a combined authority). Parents are
// found in hierarchy order among the tileset's sources, by which polygon contains an
// area's centroid, so a district in a county has the county as its parent.
let lookupCentroids;
function makeMetadata(tileset) {
  const {flag} = tileset.metadata;
  lookupCentroids ||= new Map(csvParse(readFileSync(files.lookup, {encoding: "utf8"}))
    .map(d => [d.areacd, d.centroid.split("|").map(Number)]));

  const polygonsByType = {};
  const areas = [];
  for (const source of tileset.sources) {
    const geo = geo_config.find(g => g.key === source.key);
    const features = readGzip(getValidBoundariesPath(source.key, yy(source.year))).trim().split("\n").map(line => JSON.parse(line))
      .filter(f => geo.codes.includes(f.properties.areacd.slice(0, 3)));
    for (const polygon of preparePolygons(features)) (polygonsByType[polygon.areacd.slice(0, 3)] ||= []).push(polygon);
    if (source.key === flag) continue;
    for (const f of features) {
      const centroid = lookupCentroids.get(f.properties.areacd);
      if (centroid) areas.push({areacd: f.properties.areacd, centroid, parentTypes: geo.parents});
    }
  }

  const flagCodes = geo_config.find(g => g.key === flag).codes;
  const rows = [...findParents(areas, polygonsByType)]
    .filter(([, parentcd]) => flagCodes.includes(parentcd.slice(0, 3)))
    .map(([areacd]) => ({areacd, [flag]: true}))
    .sort((a, b) => a.areacd.localeCompare(b.areacd));
  const path = files.vtilesMetadata(tileset.key, tileset.year);
  writeFileSync(path, csvFormat(rows, ["areacd", flag]));
  console.log(`Wrote ${path} (${rows.length} areas with ${flag}=true)`);
  return path;
}

async function makeTiles(geo) {
  const yr = String(geo.year).slice(-2);
  const outpath = `${dir}/${geo.key}${yr}.mbtiles`;
  outputs.push(outpath);
  if (!existsSync(outpath) || opts.force) {
    const sources = geo.sources ? geo.sources : [geo];
    const metadata = geo.metadata ? makeMetadata(geo) : null;
    const minzoom = geo.minzoom ? geo.minzoom : 0;
    const detail = [];
    for (let dtl of ["buc", "bsc", "bgc", "bfc"]) {
      const path = files.boundary(sources[0].key, sources[0].year, dtl);
      if (existsSync(path)) detail.push(dtl);
    }
    const zooms = detail.map(dtl => {
      const zms = zoom_detail.filter(zd => zd.z >= minzoom && zd.detail.includes(dtl)).map(zd => zd.z);
      return {detail: dtl, min: Math.min(...zms), max: Math.max(...zms)};
    });

    const steps = [];
    let output;

    zooms.forEach(z => {
      output = `./temp/${geo.key}${yr}-z${z.min}-${z.max}.mbtiles`;
      steps.push({cmd: `tippecanoe -o ${output} --read-parallel --detect-shared-borders --coalesce-densest-as-needed -Z ${z.min} -z ${z.max} ${sources.map(s => `-L ${s.layer ? s.layer : "boundaries"}:${files.boundary(s.key, s.year, z.detail)}`).join(" ")}`, output});
    });

    output = `./temp/${geo.key}${yr}_raw.mbtiles`;
    steps.push({cmd: `tile-join -o ${output} ${steps.map(s => s.output).join(" ")}`, output});
    output = `${metadata ? "./temp" : dir}/${geo.key}${yr}.mbtiles`;
    steps.push({cmd: `tile-join -o ${output} -c ${files.names} --empty-csv-columns-are-null --no-tile-size-limit ./temp/${geo.key}${yr}_raw.mbtiles`, output});

    if (metadata) {
      output = `${dir}/${geo.key}${yr}.mbtiles`;
      steps.push({cmd: `tile-join -o ${output} -c ${metadata} --empty-csv-columns-are-null --no-tile-size-limit ./temp/${geo.key}${yr}.mbtiles`, output});
    }

    for (let step of steps) {
      console.log(`Running ${step.cmd}`);
      if (opts.force) rmSync(step.output, {force: true});
      if (!existsSync(step.output)) await run(step.cmd);
    }
    console.log(`Wrote ${outpath}`);
  } else {
    console.log(`File already exists ${outpath}`);
  }
}

mkdir(dir);
for (let geo of selected) {
  await makeTiles(geo);
}

if (outputs.every(path => existsSync(path))) clearTemp();