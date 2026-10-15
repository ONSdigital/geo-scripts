import { writeFileSync, appendFileSync, existsSync, renameSync, rmSync } from "fs";
import { csvFormat } from "d3-dsv";
import { run, csvParse, mkdir } from "./utils.js";
import { fetchText, fetchJSON, downloadToFile } from "./lib/http.js";
import { getLayerInfo, getFeatureCount, queryUrl, resolveFields, checkResponse, ArcGISError } from "./lib/arcgis.js";
import source_files from "../config/source-files.js";

const keys = Object.keys(source_files);

// Page through a FeatureServer layer, writing features as GeoJSONSeq with
// properties renamed to areacd/areanm/areanmw. Returns the number of features.
const downloadGeo = async (file, path) => {
  const yr = file.name.match(/\d\d/)[0];
  const info = await getLayerInfo(file.id);
  const fields = resolveFields(info.fields, file.code, yr);
  const expected = await getFeatureCount(file.id);
  console.log(`Downloading ${expected.toLocaleString()} features from ${file.id}`);

  let limit = Math.min(2000, info.maxRecordCount || 2000);
  let received = 0;
  writeFileSync(path, "");
  while (received < expected) {
    const url = queryUrl(file.id, {offset: received, limit, orderBy: info.objectIdField});
    let geo;
    try {
      geo = checkResponse(await fetchJSON(url), file.id);
      if (!Array.isArray(geo.features)) throw new ArcGISError("Response has no features array", null, file.id);
    } catch (err) {
      // Large pages of detailed polygons can fail, so retry with smaller pages
      if (err.unavailable || limit <= 1) throw err;
      limit = Math.floor(limit / 2);
      console.log(`Bad API response (${err.message}). Reducing limit to ${limit.toLocaleString()}...`);
      continue;
    }
    if (geo.features.length === 0) break;
    appendFileSync(path, `${geo.features.map(feature => {
      const props = {};
      for (const field of fields) {
        if (feature.properties[field.key]) props[field.label] = feature.properties[field.key];
      }
      feature.properties = props;
      return JSON.stringify(feature);
    }).join("\n")}\n`);
    received += geo.features.length;
    console.log(`Fetched ${received.toLocaleString()} of ${expected.toLocaleString()} features`);
  }
  if (received !== expected) {
    throw new Error(`Expected ${expected.toLocaleString()} features from ${file.id} but received ${received.toLocaleString()}`);
  }
  return received;
}

const makeUrl = (id, ref_id) => {
  return id.slice(-2) === "_0" ?
    `https://opendata.arcgis.com/api/v3/datasets/${id}/downloads/data?format=csv&spatialRefId=${ref_id ? ref_id : 4326}&where=1%3D1` :
    `https://www.arcgis.com/sharing/rest/content/items/${id}/data`;
}

const downloadLookup = async (file, path) => {
  const href = makeUrl(file.id, file.ref_id);
  const data_raw = await fetchText(href);
  const names = file.names ? file.names : ["areacd", "parentcd"];
  const data = csvParse(data_raw, (d) => {
    const row = {};
    for (let i = 0; i < file.fields.length; i ++) {
      row[names[i]] = d[file.fields[i]];
    }
    return row;
  });
  const missing = file.fields.filter(f => !data.columns.includes(f));
  if (data.length === 0 || missing.length > 0) {
    throw new Error(`Lookup ${file.id} is empty or missing fields: ${missing.join(", ")}`);
  }
  const part = `${path}.part`;
  writeFileSync(part, csvFormat(data, names));
  renameSync(part, path);
};

// Convert raw GeoJSONSeq to rounded, gzipped GeoJSONSeq at out_path
const convertGeo = async (raw_path, out_path) => {
  const tmp_path = out_path.replace(".json.gz", ".convert.json");
  const precision = out_path.includes("_bf") || out_path.includes("_pwc") ? 6 : out_path.includes("_bu") ? 4 : 5;
  rmSync(tmp_path, {force: true});
  rmSync(`${tmp_path}.gz`, {force: true});
  await run(`ogr2ogr -f GeoJSONSeq -lco COORDINATE_PRECISION=${precision} "${tmp_path}" "${raw_path}"`, {env: {OGR_GEOJSON_MAX_OBJ_SIZE: 8000}});
  await run(`gzip "${tmp_path}"`);
  renameSync(`${tmp_path}.gz`, out_path);
  rmSync(raw_path, {force: true});
};

async function downloadFile(key, file, dir) {
  if (["boundaries", "centroids"].includes(key)) {
    const out_path = `${dir}/${file.name}.json.gz`;
    if (existsSync(out_path)) return console.log(`${out_path} already downloaded`);
    const raw_path = `${dir}/${file.name}.download.jsonl`;
    await downloadGeo(file, raw_path);
    await convertGeo(raw_path, out_path);
    console.log(`Downloaded and transformed ${out_path}`);
  } else {
    const path = `${dir}/${file.name}`;
    if (existsSync(path)) return console.log(`${path} already downloaded`);
    if (key === "census") await downloadLookup(file, path);
    else await downloadToFile(file.href, path);
    console.log(`Downloaded ${path}`);
  }
}

async function downloadFiles() {
  const failures = [];
  for (const key of keys) {
    const dir = `./input/${key}`;
    mkdir(dir);
    for (const file of source_files[key]) {
      try {
        await downloadFile(key, file, dir);
      } catch (err) {
        console.error(`FAILED ${file.name}: ${err.message}`);
        failures.push({file, err});
      }
    }
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} file(s) failed to download:`);
    for (const {file, err} of failures) console.error(`  ${file.name} (${file.id || file.href}): ${err.message}`);
    process.exit(1);
  }
  console.log("All files downloaded.");
}

await downloadFiles();
