// Checks the dataset IDs in config/source-files.js against the Geoportal API, and
// looks for newly published releases of each geography.
//
// Usage: npm run check-sources [-- --no-verify]
//   --no-verify  skip checking that suggested datasets contain the expected fields
//
// Each calendar year should use the most recent release published in that year,
// since boundaries and codes change at most once a year. A new year is only worth
// adding if some area codes have changed (eg. mergers or boundary changes), so the
// codes in each new release are compared with the latest year in lookup.csv, without
// downloading any boundaries. Releases with the same codes are listed as skipped.
//
// Suggestions are printed for review, not written to the config: dataset names on
// the Geoportal are inconsistent, so always check a suggestion before using it.
import { parseArgs } from "util";
import { readFileSync } from "fs";
import source_files from "../config/source-files.js";
import geo_config from "../config/geo-config.js";
import { listServices, getLayerId, getLayerInfo, getFeatureCount, fetchAttributes, resolveFields, parseServiceName } from "./lib/arcgis.js";
import { expandGeoSources, checkManifest, findNewReleases, codesInYear, compareCodes, datasetsBySize } from "./lib/sources.js";
import { csvParse } from "./utils.js";
import { yy, files as paths } from "../config/paths.js";

const {values: args} = parseArgs({options: {"no-verify": {type: "boolean", default: false}}});

const files = [
  ...expandGeoSources(source_files.boundaries),
  ...expandGeoSources(source_files.centroids)
];

console.log("Fetching the list of Geoportal datasets...");
const catalogue = await listServices();
console.log(`Found ${catalogue.length.toLocaleString()} datasets.\n`);

// Check that a dataset exists, has a {CODE}{YY}CD field and isn't empty
const verified = new Map();
async function verify(id, code) {
  if (args["no-verify"]) return "";
  if (!verified.has(id)) {
    const year = parseServiceName(id)?.year;
    verified.set(id, getLayerId(id)
      .then(async layer => {
        resolveFields((await getLayerInfo(id, layer)).fields, code, yy(year));
        const count = await getFeatureCount(id, layer);
        if (count === 0) return "NOT USABLE: published with no features";
        return `OK, ${count.toLocaleString()} features${layer === 0 ? "" : ` (layer ${layer})`}`;
      })
      .catch(err => `NOT USABLE: ${err.message.split(". ")[0]}`));
  }
  return verified.get(id);
}

// Whether a dataset can be downloaded, by asking the API directly
async function isAvailable(id) {
  try {
    return await getFeatureCount(id, await getLayerId(id)) > 0;
  } catch {
    return false;
  }
}

// 1. Existing manifest entries
const results = checkManifest(files, catalogue);
// The catalogue listing isn't always complete, so confirm that "missing" datasets
// really are unavailable before reporting them
for (const result of results.filter(r => r.status === "missing")) {
  if (await isAvailable(result.file.id)) result.status = "ok";
}
const problems = results.filter(r => r.status !== "ok");
console.log(`== Manifest: ${results.length - problems.length} of ${results.length} dataset IDs are current ==`);
for (const {file, status, candidates} of problems) {
  console.log(`\n${file.name}: ${file.id}`);
  console.log(status === "missing" ?
    "  MISSING from the Geoportal (retired, renamed or made private)" :
    "  A newer version is available");
  if (candidates.length === 0) console.log("  No replacement found - search https://geoportal.statistics.gov.uk manually");
  for (const [i, name] of candidates.entries()) {
    const check = await verify(name, file.code);
    console.log(`  ${i === 0 ? "suggested:" : "   or:    "} ${name}${check ? `  [${check}]` : ""}`);
  }
}

// 2. Newer releases (one per calendar year), as entries ready to paste into config/source-files.js
const releases = findNewReleases(files, catalogue);
const monthName = (m) => m ? `${m[0].toUpperCase()}${m.slice(1)} ` : "";
console.log(`\n== Newer releases: ${releases.length} found ==`);

// Area codes (and names) in a release, without geometry, from its smallest dataset
// that has any features (some are published empty)
async function releaseCodes(release) {
  let error = new Error("no datasets");
  for (const id of datasetsBySize(release.ids)) {
    try {
      const layer = await getLayerId(id);
      const info = await getLayerInfo(id, layer);
      const [cd, nm] = resolveFields(info.fields, release.code, yy(release.year));
      const rows = await fetchAttributes(id, [cd.key, nm?.key].filter(f => f), {layer, orderBy: info.objectIdField});
      if (rows.length === 0) throw new Error(`${id} has no features`);
      return {codes: rows.map(r => r[cd.key]), names: new Map(rows.map(r => [r[cd.key], nm ? r[nm.key] : null]))};
    } catch (err) {
      error = err;
    }
  }
  throw error;
}

const lookup = csvParse(readFileSync(paths.lookup, {encoding: "utf8"}));
const lookupNames = new Map(lookup.map(d => [d.areacd, d.areanm]));
const examples = (codes) => codes.length ? ` (eg. ${codes.slice(0, 3).join(", ")}${codes.length > 3 ? ", ..." : ""})` : "";
function describe(change, names) {
  const renamed = [...names].filter(([cd, nm]) => nm && lookupNames.has(cd) && lookupNames.get(cd) !== nm).length;
  return [
    `${change.added.length} new codes${examples(change.added)}`,
    `${change.removed.length} ended${examples(change.removed)}`,
    ...(renamed ? [`${renamed} renamed`] : []),
    ...(change.otherPrefixes.length ? [`ignoring ${change.otherPrefixes.join(", ")}, which aren't configured`] : [])
  ].join("; ");
}

// The codes each new release is compared with, by geography: the latest configured
// year at first, then the latest release that's worth adding
const baselines = {};
const skipped = [];
for (const release of releases) {
  const geo = geo_config.find(g => g.key === release.key);
  const label = `${monthName(release.month)}${release.year}`;
  if (!baselines[release.key]) {
    const year = Math.max(...geo.years);
    baselines[release.key] = {year, codes: codesInYear(lookup, geo.codes, year)};
    if (baselines[release.key].codes.size === 0) {
      console.log(`\nWarning: lookup.csv has no ${release.key} codes for ${year} - run get-metadata and get-relations to compare codes`);
    }
  }
  const baseline = baselines[release.key];

  let codes, note;
  try {
    codes = await releaseCodes(release);
  } catch (err) {
    note = `couldn't check its codes (${err.message.split(". ")[0]}), so review it manually`;
  }

  if (release.status === "update") {
    if (codes) {
      const change = compareCodes(codesInYear(lookup, geo.codes, release.year), codes.codes, geo.codes);
      note = `compared with ${release.year} in lookup.csv: ${describe(change, codes.names)}`;
      if (release.year === baseline.year) baseline.codes = new Set(codes.codes);
    }
    console.log(`\n// ${release.key} ${release.year}: replace the existing entry with the later ${label} release\n//   ${note}`);
  } else {
    if (codes) {
      const change = compareCodes(baseline.codes, codes.codes, geo.codes);
      if (change.added.length === 0 && change.removed.length === 0) {
        skipped.push(`${release.key} ${release.year} (${label}): same codes as ${baseline.year}`);
        continue;
      }
      note = `compared with ${baseline.year}: ${describe(change, codes.names)}`;
      baselines[release.key] = {year: release.year, codes: new Set(codes.codes)};
    }
    console.log(`\n// ${release.key} ${release.year}: new year (${label} release)\n//   ${note}`);
  }

  console.log(`{key: "${release.key}", year: ${release.year}, code: "${release.code}", ids: {`);
  for (const [detail, name] of Object.entries(release.ids)) {
    const check = await verify(name, release.code);
    console.log(`  ${detail}: "${name}",${check ? ` // ${check}` : ""}`);
  }
  for (const detail of release.missing) console.log(`  // ${detail}: not published in this release - find one manually`);
  console.log("}},");
}

if (skipped.length) {
  console.log(`\n== Skipped ${skipped.length} new years with no code changes ==`);
  for (const line of skipped) console.log(`  ${line}`);
}
if (releases.length > skipped.length) {
  console.log("\nBoundaries change at most once a year, so each year uses the most recent release published in it. " +
    "For a new year, add its entry to config/source-files.js and the year to config/geo-config.js " +
    "(and config/vtiles-config.js if needed). For an update, replace the year's entry, then re-download with --force.");
}
