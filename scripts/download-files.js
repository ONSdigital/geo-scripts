import { writeFileSync, appendFileSync, existsSync, renameSync, rmSync, createWriteStream } from "fs";
import zlib from "zlib";
import readline from "line-by-line";
import { csvFormat } from "d3-dsv";
import { run, csvParse, mkdir } from "./utils.js";
import { fetchText, fetchJSON, downloadToFile } from "./lib/http.js";
import { getLayerId, getLayerInfo, getFeatureCount, queryUrl, resolveFields, checkResponse, ArcGISError } from "./lib/arcgis.js";
import source_files from "../config/source-files.js";
import { dirs, yy } from "../config/paths.js";
import { expandGeoSources } from "./lib/sources.js";
import { cli, selectGeos, isSelection } from "./lib/cli.js";
import geo_config from "../config/geo-config.js";
import { tagFor, assetUrl, getManifest, sha256File } from "./lib/archive.js";
import { readRecord, recordDownload, recordedOtherSource } from "./lib/local-sources.js";

const usage = `Usage: npm run download-files -- [--geo ltla,wd] [--year 2025] [--force] [--source geoportal]
  --geo, --year  only download boundaries/centroids for these geographies and years
                 (other source files are only downloaded when there is no selection)
  --force        download again even if the file already exists
  --source       "archive" (default): use the copy in the source file archive if there is one,
                 otherwise the Geoportal. "geoportal": always use the Geoportal.`;
const {opts, selected} = cli(usage, opts => {
  if (!["archive", "geoportal"].includes(opts.source)) throw new Error(`--source must be "archive" or "geoportal"`);
  return selectGeos(geo_config, opts);
}, {source: {type: "string", default: "archive"}});
const isSelected = (file) => selected.some(g => g.key === file.key && g.years.includes(file.year));

// Files to download, by input folder
const sources = {
  boundaries: expandGeoSources(source_files.boundaries).filter(isSelected),
  centroids: expandGeoSources(source_files.centroids).filter(isSelected),
  census: isSelection(opts) ? [] : source_files.census,
  other: isSelection(opts) ? [] : source_files.other
};

// Page through a FeatureServer layer, writing features as GeoJSONSeq with
// properties renamed to areacd/areanm/areanmw. Returns the number of features.
const downloadGeo = async (file, path) => {
  const yr = yy(file.year);
  const layer = await getLayerId(file.id);
  const info = await getLayerInfo(file.id, layer);
  const fields = resolveFields(info.fields, file.code, yr);
  const expected = await getFeatureCount(file.id, layer);
  // Some datasets are published empty (eg. Wards_December_2024_Boundaries_UK_BSC)
  if (expected === 0) throw new Error(`Dataset "${file.id}" has no features - it may have been published empty, so use another dataset`);
  console.log(`Downloading ${expected.toLocaleString()} features from ${file.id}`);

  let limit = Math.min(2000, info.maxRecordCount || 2000);
  let received = 0;
  writeFileSync(path, "");
  while (received < expected) {
    // Never ask for more than remain, so halving the page size takes effect straight away
    limit = Math.min(limit, expected - received);
    const url = queryUrl(file.id, {layer, offset: received, limit, orderBy: info.objectIdField});
    let geo;
    try {
      // Pages of full-detail polygons can be very large (eg. ~100MB for the four UK countries)
      geo = checkResponse(await fetchJSON(url, {timeout: 20 * 60_000, retries: 2}), file.id);
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
        // Trim names, and drop blank ones (eg. " " for a missing Welsh name)
        const value = feature.properties[field.key];
        const trimmed = typeof value === "string" ? value.trim() : value;
        if (trimmed) props[field.label] = trimmed;
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
// Coordinate precision for a file's detail level
const precisionFor = (path) => path.includes("_bf") || path.includes("_pwc") ? 6 : path.includes("_bu") ? 4 : 5;

const convertGeo = async (raw_path, out_path) => {
  const tmp_path = out_path.replace(".json.gz", ".convert.json");
  const precision = precisionFor(out_path);
  rmSync(tmp_path, {force: true});
  rmSync(`${tmp_path}.gz`, {force: true});
  await run(`ogr2ogr -f GeoJSONSeq -lco COORDINATE_PRECISION=${precision} "${tmp_path}" "${raw_path}"`, {env: {OGR_GEOJSON_MAX_OBJ_SIZE: 8000}});
  await run(`gzip "${tmp_path}"`);
  renameSync(`${tmp_path}.gz`, out_path);
  rmSync(raw_path, {force: true});
};

// Use the archived copy of a file, if there is one (see config/archive.js) and it's from
// the dataset in the config. Local copies that differ from the archive are replaced, so
// that corrections reach everyone. Returns false if there's no suitable archived copy.
async function downloadFromArchive(file, name, path, source, force) {
  if (opts.source !== "archive") return false;
  const tag = tagFor(file);
  let entry;
  try {
    entry = (await getManifest(tag))?.files?.[name];
  } catch (err) {
    console.warn(`Couldn't read the archive for ${tag} (${err.message}), so using the Geoportal`);
    return false;
  }
  if (!entry) return false;
  if (entry.source && entry.source !== source) {
    console.log(`The archived ${name} is from ${entry.source}, not ${source}, so using the Geoportal`);
    return false;
  }
  if (existsSync(path) && !force) {
    if (await sha256File(path) === entry.sha256) {
      console.log(`${path} already downloaded (matches the archive)`);
      return true;
    }
    console.log(`${path} differs from the archived copy, so replacing it`);
  }
  const tmp_path = `${path}.archive`;
  await downloadToFile(assetUrl(tag, name), tmp_path);
  if (await sha256File(tmp_path) !== entry.sha256) {
    rmSync(tmp_path, {force: true});
    throw new Error(`The archived ${name} doesn't match its checksum (it may be being replaced) - try again later, or use --source geoportal`);
  }
  renameSync(tmp_path, path);
  recordDownload(name, source, "archive");
  console.log(`Downloaded ${path} from the archive (${tag})`);
  return true;
}

// Write GeoJSONSeq features as gzipped GeoJSONSeq, with properties renamed to
// areacd/areanm/areanmw (trimmed, blanks dropped) and single-part MultiPolygons as
// Polygons. Streams line by line, as some files are several GB. Returns the count.
function writeFeatures(input, output, fields) {
  return new Promise((resolve, reject) => {
    const gzip = zlib.createGzip();
    const out = createWriteStream(output);
    gzip.pipe(out);
    const lines = new readline(input);
    let count = 0;
    lines.on("line", (line) => {
      if (!line.trim()) return;
      const feature = JSON.parse(line);
      const props = {};
      for (const field of fields) {
        const value = feature.properties[field.key];
        const trimmed = typeof value === "string" ? value.trim() : value;
        if (trimmed) props[field.label] = trimmed;
      }
      let geometry = feature.geometry;
      if (geometry?.type === "MultiPolygon" && geometry.coordinates.length === 1) {
        geometry = {type: "Polygon", coordinates: geometry.coordinates[0]};
      }
      count ++;
      if (!gzip.write(`${JSON.stringify({type: "Feature", properties: props, geometry})}\n`)) {
        lines.pause();
        gzip.once("drain", () => lines.resume());
      }
    });
    lines.on("error", reject);
    lines.on("end", () => gzip.end());
    out.on("finish", () => resolve(count));
    out.on("error", reject);
  });
}

// Download a whole dataset as one pre-built GeoJSON file from the Geoportal's download
// service (opendata.arcgis.com). This is much faster than paging through the API, and
// keeps holes in polygons (eg. Nottingham in Nottinghamshire), which the API's GeoJSON
// can return as separate polygons. Returns false if it fails, to fall back to the API.
async function downloadGeoBulk(file, out_path) {
  const layer = await getLayerId(file.id);
  const info = await getLayerInfo(file.id, layer);
  const fields = resolveFields(info.fields, file.code, yy(file.year));
  const expected = await getFeatureCount(file.id, layer);
  if (expected === 0) throw new Error(`Dataset "${file.id}" has no features - it may have been published empty, so use another dataset`);
  if (!info.serviceItemId) return false;

  const base = out_path.replace(".json.gz", "");
  const temp = {hub: `${base}.hub.geojson`, select: `${base}.select.jsonl`, out: `${out_path}.part`};
  try {
    console.log(`Downloading ${expected.toLocaleString()} features from ${file.id} as a single file`);
    const url = `https://opendata.arcgis.com/api/v3/datasets/${info.serviceItemId}_${layer}/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1`;
    await downloadToFile(url, temp.hub, {retries: 2});
    // ogr2ogr keeps just the code/name fields and rounds the coordinates, streaming the file
    await run(`ogr2ogr -f GeoJSONSeq -lco COORDINATE_PRECISION=${precisionFor(out_path)} -select "${fields.map(f => f.key).join(",")}" "${temp.select}" "${temp.hub}"`, {env: {OGR_GEOJSON_MAX_OBJ_SIZE: 8000}});
    const count = await writeFeatures(temp.select, temp.out, fields);
    if (count !== expected) throw new Error(`expected ${expected.toLocaleString()} features but the file has ${count.toLocaleString()}`);
    renameSync(temp.out, out_path);
    return true;
  } catch (err) {
    console.log(`Single-file download of ${file.id} failed (${err.message.split("\n")[0]}), so paging through the API instead`);
    return false;
  } finally {
    for (const path of Object.values(temp)) rmSync(path, {force: true});
  }
}

async function downloadFile(key, file, dir) {
  const name = ["boundaries", "centroids"].includes(key) ? `${file.name}.json.gz` : file.name;
  const source = file.id || file.href;
  // Download again if the local copy is from a different dataset than the config now uses
  const previous = recordedOtherSource(readRecord(), name, source);
  if (previous && existsSync(`${dir}/${name}`)) console.log(`${dir}/${name} is from ${previous}, but the config now uses ${source}, so downloading it again`);
  const force = opts.force || Boolean(previous);
  if (await downloadFromArchive(file, name, `${dir}/${name}`, source, force)) return;
  if (["boundaries", "centroids"].includes(key)) {
    const out_path = `${dir}/${name}`;
    if (existsSync(out_path) && !force) return console.log(`${out_path} already downloaded`);
    if (!(await downloadGeoBulk(file, out_path))) {
      const raw_path = `${dir}/${file.name}.download.jsonl`;
      await downloadGeo(file, raw_path);
      await convertGeo(raw_path, out_path);
    }
    recordDownload(name, source, "geoportal");
    console.log(`Downloaded and transformed ${out_path}`);
  } else {
    const path = `${dir}/${name}`;
    if (existsSync(path) && !force) return console.log(`${path} already downloaded`);
    if (key === "census") await downloadLookup(file, path);
    else await downloadToFile(file.href, path);
    recordDownload(name, source, "source");
    console.log(`Downloaded ${path}`);
  }
}

async function downloadFiles() {
  const failures = [];
  for (const key of Object.keys(sources)) {
    const dir = dirs[key];
    mkdir(dir);
    for (const file of sources[key]) {
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
