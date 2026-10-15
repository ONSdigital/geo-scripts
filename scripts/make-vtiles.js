import { existsSync, rmSync } from "fs";
import { run, clearTemp, mkdir } from "./utils.js";
import tilesets from "../config/vtiles-config.js";
import zoom_detail from "../config/vtiles-detail.js";
import { dirs, files } from "../config/paths.js";
import { cli, selectTilesets } from "./lib/cli.js";

const usage = `Usage: npm run make-vtiles -- [--geo la,wd] [--year 2025] [--force]
  --geo, --year  only make these tilesets (keys and years from config/vtiles-config.js)
  --force        remake tilesets that already exist`;
const {opts, selected} = cli(usage, opts => selectTilesets(tilesets, opts));

// const maxzoom = 12;
const dir = dirs.vtiles;

let outputs = [];

async function makeTiles(geo) {
  const yr = String(geo.year).slice(-2);
  const outpath = `${dir}/${geo.key}${yr}.mbtiles`;
  outputs.push(outpath);
  if (!existsSync(outpath) || opts.force) {
    const sources = geo.sources ? geo.sources : [geo];
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
    output = `${geo.metadata ? "./temp" : dir}/${geo.key}${yr}.mbtiles`;
    steps.push({cmd: `tile-join -o ${output} -c ${files.names} --empty-csv-columns-are-null --no-tile-size-limit ./temp/${geo.key}${yr}_raw.mbtiles`, output});

    if (geo.metadata) {
      output = `${dir}/${geo.key}${yr}.mbtiles`;
      steps.push({cmd: `tile-join -o ${output} -c ${geo.metadata} --empty-csv-columns-are-null --no-tile-size-limit ./temp/${geo.key}${yr}.mbtiles`, output});
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