import { readdirSync } from "fs";
import geos from "../config/geo-config.js";
import { dirs } from "../config/paths.js";
import { readGzip, writeGzip, mkdir } from "./utils.js";

const geoCodes = {};
for (const geo of geos) {
  if (geo.cmkey) {
    for (const cd of geo.codes) {
      if (!geo.cmfilter || geo.cmfilter.includes(cd[0])) geoCodes[cd] = geo;
    }
  }
}

function makeCmGeo(feature, geo) {
  const props = feature?.properties;
  if (!feature || props.start) return null;
  return {
    meta: {
      code: props.areacd,
      name: props.hclnm || props.areanm || props.areacd,
      geotype: geo.cmkey
    },
    geo_json: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "centroid",
          geometry: {
            type: "Point",
            coordinates: props.centroid
          },
          properties: null
        },
        {
          type: "Feature",
          id: "bbox",
          geometry: {
            type: "LineString",
            coordinates: [
              [props.bounds[0], props.bounds[1]],
              [props.bounds[2], props.bounds[3]]
            ]
          },
          properties: null
        },
        {
          type: "Feature",
          id: "boundary",
          geometry: feature.geometry,
          properties: null
        }
      ]
    }
  };
}

const outdir = dirs.cmGeos;

// Create directory if needed
mkdir(outdir);

for (const cd of Object.keys(geoCodes)) {
  const dir = `${dirs.geos}/${cd}`;
  const files = readdirSync(dir)
    .filter(f => f.slice(-5) === ".json");
  
  for (const file of files) {
    const feature = JSON.parse(readGzip(`${dir}/${file}`));
    const data = makeCmGeo(feature, geoCodes[cd]);
    if (data) {
      const outpath = `${outdir}/${file}`;
      writeGzip(outpath, JSON.stringify(data));
      console.log(`Wrote ${outpath}`);
    }
  }
}
