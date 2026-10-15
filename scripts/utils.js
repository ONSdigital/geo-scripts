import https from "https";
import fs from "fs";
import zlib from "zlib";
import { area, booleanPointInPolygon } from "@turf/turf";
import polylabel from "polylabel";
import { exec } from "child_process";
import * as d3 from "d3-dsv";
import geo_config from "../config/geo-config.js";

export function csvParse(str, row = d3.autoType) {
  return d3.csvParse(str.replace(/\uFEFF/, ''), row);
}

export function makeLookup(data, key = "areacd") {
  const lookup = {};
  data.forEach(d => lookup[d[key]] = d);
  return lookup;
}

export function fetch(url) {
  return new Promise((resolve) => {
    https.get(url, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        resolve(data);
      });
    })
    .on("error", (err) => {
      console.log("Error: " + err.message);
    });
  });
}

export async function download(url, dest) {
  await run(`curl -L -o "${dest}" "${url}"`);
  console.log(`Downloaded ${dest}`);
  return;
}

export function run(cmd, opts = {}) {
  // Extend rather than replace the environment, so that PATH etc. are kept
  const env = opts.env ?
    {...process.env, ...Object.fromEntries(Object.entries(opts.env).map(([k, v]) => [k, String(v)]))} :
    process.env;
  return new Promise((resolve, reject) => {
    exec(cmd, {maxBuffer: 1024 * 1024 * 64, ...opts, env}, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

export async function clearTemp() {
  try {
    await run("rm -r ./temp/*");
    console.log("Emptied /temp folder");
  }
  catch {
    console.log("No files to delete in /temp");
  }
}

export function readGzip(path) {
  return zlib.gunzipSync(fs.readFileSync(path)).toString();
}

export function writeGzip(path, data) {
  fs.writeFileSync(path, zlib.gzipSync(data));
}

export function round(num, dp = 6) {
  let multiplier = Math.pow(10, dp);
  return Math.round(num * multiplier) / multiplier;
}

export function roundAll(arr, decimals = 6) {
  let newarr = [];
  arr.forEach(d => {
    if (typeof d == "number") {
      newarr.push(round(d, decimals));
    } else if (Array.isArray(d)) {
      newarr.push(roundAll(d, decimals));
    } else {
      newarr.push(d);
    }
  });
  return newarr;
}

const codePrecision = (() => {
  const getPrecision = (detail) => detail?.startsWith("bf") ? 6 : detail === "buc" ? 4 : 5;
  const lookup = {};
  for (const geo of geo_config) {
    for (const code of geo.codes) lookup[code] = Math.pow(10, -getPrecision(geo.detail));
  }
  return lookup;
})();

function getPolyPrecision(code) {
  return codePrecision[code.slice(0, 3)];
}

function checkPolylabel(centroid, polygon) {
  if (!booleanPointInPolygon(
    {type: "Point", coordinates: centroid},
    {type: "Polygon", coordinates: polygon},
  )) throw new Error("Generated centroid is not in polygon!");
}

export function findPolylabel(feature) {
  const precision = getPolyPrecision(feature.properties.areacd) || 0.00001;

  let output = [];
  if (feature.geometry.type === "Polygon"){
    const coords = feature.geometry.coordinates;
    output = polylabel(coords, precision);
    checkPolylabel(output, coords);
  }
  else {
    let maxArea = 0, maxPolygon = [];
    for (let i = 0, l = feature.geometry.coordinates.length; i < l; i++){
      const p = feature.geometry.coordinates[i];
      const _area = area({type: "Polygon", coordinates: p})
      if (_area > maxArea){
        maxPolygon = p;
        maxArea = _area;
      }
    }
    output = polylabel(maxPolygon, precision);
    checkPolylabel(output, maxPolygon);
  }
  return output;
}

export function getValidBoundariesPath(key, yr, detail = ["bfe", "bfc"]) {
  for (const det of detail) {
    const path = `./input/boundaries/${key}${yr}_${det}.json.gz`;
    if (fs.existsSync(path)) return path;
  }
  console.log(`Valid file path not found for ${key} and ${yr}!`);
}

export async function unzip(path, dest) {
  await run(`unzip "${path}" -d "${dest}"`);
  console.log(`Unzipped ${path}`);
  return;
}

export function mkdir(path) {
  if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });
}
