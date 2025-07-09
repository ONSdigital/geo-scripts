import { existsSync } from "fs";
import { run, clearTemp, mkdir } from "./utils.js";
import geos from "../config/vtiles-config.js";
import zoom_detail from "../config/vtiles-detail.js";

// const maxzoom = 12;
const dir = "./output/vtiles";

let outputs = [];

async function makeTiles(geo) {
  const yr = String(geo.year).slice(-2);
  const outpath = `${dir}/${geo.key}${yr}.mbtiles`;
  outputs.push(outpath);
  if (!existsSync(outpath)) {
    const sources = geo.sources ? geo.sources : [geo];
    const minzoom = geo.minzoom ? geo.minzoom : 0;
    const detail = [];
    for (let dtl of ["buc", "bsc", "bgc", "bfc"]) {
      const path = `./input/boundaries/${sources[0].key}${String(sources[0].year).slice(-2)}_${dtl}.json.gz`;
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
      steps.push({cmd: `tippecanoe -o ${output} --read-parallel --detect-shared-borders --coalesce-densest-as-needed -Z ${z.min} -z ${z.max} ${sources.map(s => `-L ${s.layer ? s.layer : "boundaries"}:./input/boundaries/${s.key}${String(s.year).slice(-2)}_${z.detail}.json.gz`).join(" ")}`, output});
    });

    output = `./temp/${geo.key}${yr}_raw.mbtiles`;
    steps.push({cmd: `tile-join -o ${output} ${steps.map(s => s.output).join(" ")}`, output});
    output = `${geo.metadata ? "./temp" : dir}/${geo.key}${yr}.mbtiles`;
    steps.push({cmd: `tile-join -o ${output} -c ./input/lookups/lookup_names.csv --empty-csv-columns-are-null --no-tile-size-limit ./temp/${geo.key}${yr}_raw.mbtiles`, output});

    if (geo.metadata) {
      output = `${dir}/${geo.key}${yr}.mbtiles`;
      steps.push({cmd: `tile-join -o ${output} -c ${geo.metadata} --empty-csv-columns-are-null --no-tile-size-limit ./temp/${geo.key}${yr}.mbtiles`, output});
    }

    for (let step of steps) {
      console.log(`Running ${step.cmd}`);
      if (!existsSync(step.output)) await run(step.cmd);
    }
    console.log(`Wrote ${outpath}`);
  } else {
    console.log(`File already exists ${outpath}`);
  }
}

mkdir(dir);
for (let geo of geos) {
  await makeTiles(geo);
}

if (outputs.every(path => existsSync(path))) clearTemp();