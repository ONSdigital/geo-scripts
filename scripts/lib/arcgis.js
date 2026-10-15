// Helpers for the ONS Open Geography Portal's ArcGIS REST API.
import { fetchJSON } from "./http.js";

export const SERVICES_URL = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services";

export const layerUrl = (id) => `${SERVICES_URL}/${encodeURIComponent(id)}/FeatureServer/0`;

export class ArcGISError extends Error {
  constructor(message, code, id) {
    super(message);
    this.name = "ArcGISError";
    this.code = code;
    this.id = id;
    // Missing or retired datasets won't come back on a retry
    this.unavailable = code === 499 || code === 403 || /invalid url|not found|token required/i.test(message);
    this.retryable = !this.unavailable;
  }
}

// The API reports errors with an HTTP 200 and an {"error": {...}} body
export function checkResponse(json, id) {
  if (json?.error) {
    const {code, details = []} = json.error;
    const message = json.error.message || details[0] || "Unknown error";
    const extra = details.filter(d => d !== message);
    const err = new ArcGISError(`${message}${extra.length ? ` (${extra.join("; ")})` : ""}`, code, id);
    if (err.unavailable) {
      err.message = `Dataset "${id}" is unavailable from the Geoportal API: ${err.message.replace(/\.$/, "")}. ` +
        "It may have been retired or replaced by a new version - run `npm run check-sources` to find replacements.";
    }
    throw err;
  }
  return json;
}

export async function getLayerInfo(id) {
  return checkResponse(await fetchJSON(`${layerUrl(id)}?f=json`), id);
}

export async function getFeatureCount(id) {
  const json = checkResponse(await fetchJSON(`${layerUrl(id)}/query?where=1%3D1&returnCountOnly=true&f=json`), id);
  return json.count;
}

export function queryUrl(id, {offset = 0, limit = 2000, orderBy} = {}) {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    resultRecordCount: limit,
    resultOffset: offset,
    outSR: 4326,
    f: "geojson"
  });
  // Paging is only guaranteed to be stable with an explicit order
  if (orderBy) params.set("orderByFields", orderBy);
  return `${layerUrl(id)}/query?${params}`;
}

// Map the dataset's {CODE}{YY}CD/NM/NMW fields to areacd/areanm/areanmw.
// Field-name case varies between datasets, so match case-insensitively.
export function resolveFields(fields, code, yr) {
  const names = fields.map(f => f.name);
  const mapping = [];
  for (const ext of ["cd", "nm", "nmw"]) {
    const target = `${code}${yr}${ext}`.toLowerCase();
    const key = names.find(n => n.toLowerCase() === target);
    if (key) mapping.push({key, label: `area${ext}`});
    else if (ext === "cd") {
      const codeFields = names.filter(n => /\d\dcd$/i.test(n));
      throw new Error(`Expected a ${code}${yr}CD field but found ${codeFields.length ? codeFields.join(", ") : "none"} ` +
        `(all fields: ${names.join(", ")}). Check the "code" and year in config/source-files.js.`);
    }
  }
  return mapping;
}

export async function listServices() {
  const json = checkResponse(await fetchJSON(`${SERVICES_URL}?f=json`), "services");
  return json.services.filter(s => s.type === "FeatureServer").map(s => s.name);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DETAILS = {
  bfe: "bfe", bfc: "bfc", bgc: "bgc", bsc: "bsc", buc: "buc", pwc: "pwc",
  // Older naming conventions
  feb: "bfe", fcb: "bfc", gcb: "bgc", sgcb: "bsc", ugcb: "buc"
};

// Break a Geoportal service name into its parts, eg.
// "LAD_MAY_2025_UK_BGC_V2" -> {family: "lad", month: "may", year: 2025, detail: "bgc", version: 2}
// "Wards_December_2024_Boundaries_UK_BFC" -> {family: "wards", month: "dec", year: 2024, detail: "bfc", version: 0}
export function parseServiceName(name) {
  const tokens = name.replace(/[()]/g, "").split("_").filter(t => t);
  const lower = tokens.map(t => t.toLowerCase());
  const yearIndex = lower.findIndex(t => /^(19|20)\d\d$/.test(t));
  if (yearIndex < 1) return null;

  let familyEnd = yearIndex;
  let month = null;
  const monthToken = lower[yearIndex - 1]?.slice(0, 3);
  if (MONTHS.includes(monthToken)) {
    month = monthToken;
    familyEnd = yearIndex - 1;
  }
  if (familyEnd < 1) return null;

  const rest = lower.slice(yearIndex + 1);
  const detailToken = rest.find(t => DETAILS[t]);
  const versionToken = rest.find(t => /^v\d+$/.test(t));
  return {
    name,
    family: lower.slice(0, familyEnd).join("_"),
    month,
    year: +lower[yearIndex],
    detail: detailToken ? DETAILS[detailToken] : null,
    version: versionToken ? +versionToken.slice(1) : 0,
    // Plural/singular forms are used interchangeably, eg. Output_Area(s)
    familyKey: lower.slice(0, familyEnd).map(t => t.replace(/s$/, "")).join("_"),
    // Variants with extra fields (eg. rural-urban classification) or names-and-codes tables
    variant: rest.includes("ruc") || rest.includes("nc")
  };
}
