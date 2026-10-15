// Checks the dataset IDs in config/source-files.js against the Geoportal API, and
// looks for newly published releases of each geography.
//
// Usage: npm run check-sources [-- --no-verify]
//   --no-verify  skip checking that suggested datasets contain the expected fields
//
// Suggestions are printed for review, not written to the config: dataset names on
// the Geoportal are inconsistent, so always check a suggestion before using it.
import { parseArgs } from "util";
import source_files from "../config/source-files.js";
import { listServices, getLayerInfo, resolveFields, parseServiceName } from "./lib/arcgis.js";
import { expandGeoSources, checkManifest, findNewReleases } from "./lib/sources.js";
import { yy } from "../config/paths.js";

const {values: args} = parseArgs({options: {"no-verify": {type: "boolean", default: false}}});

const files = [
  ...expandGeoSources(source_files.boundaries),
  ...expandGeoSources(source_files.centroids)
];

console.log("Fetching the list of Geoportal datasets...");
const catalogue = await listServices();
console.log(`Found ${catalogue.length.toLocaleString()} datasets.\n`);

// Check that a dataset exists and has a {CODE}{YY}CD field
const verified = new Map();
async function verify(id, code) {
  if (args["no-verify"]) return "";
  if (!verified.has(id)) {
    const year = parseServiceName(id)?.year;
    verified.set(id, getLayerInfo(id)
      .then(info => {
        resolveFields(info.fields, code, yy(year));
        return "fields OK";
      })
      .catch(err => `NOT USABLE: ${err.message.split(". ")[0]}`));
  }
  return verified.get(id);
}

// 1. Existing manifest entries
const results = checkManifest(files, catalogue);
const problems = results.filter(r => r.status !== "ok");
console.log(`== Manifest: ${results.length - problems.length} of ${results.length} dataset IDs are current ==`);
for (const {file, status, candidates} of problems) {
  console.log(`\n${file.name}: ${file.id}`);
  console.log(status === "missing" ?
    "  MISSING from the Geoportal (retired, renamed or made private)" :
    "  A newer version is available");
  if (candidates.length === 0) console.log("  No replacement found - search https://geoportal.statistics.gov.uk manually");
  for (const [i, name] of candidates.entries()) {
    const status = await verify(name, file.code);
    console.log(`  ${i === 0 ? "suggested:" : "   or:    "} ${name}${status ? `  [${status}]` : ""}`);
  }
}

// 2. New releases, as entries ready to paste into config/source-files.js
const releases = findNewReleases(files, catalogue);
console.log(`\n== New releases: ${releases.length} found ==`);
for (const release of releases) {
  const label = `${release.month ? `${release.month[0].toUpperCase()}${release.month.slice(1)} ` : ""}${release.year}`;
  console.log(`\n// ${release.key} ${label}`);
  console.log(`{key: "${release.key}", year: ${release.year}, code: "${release.code}", ids: {`);
  for (const [detail, name] of Object.entries(release.ids)) {
    const status = await verify(name, release.code);
    console.log(`  ${detail}: "${name}",${status ? ` // ${status}` : ""}`);
  }
  console.log("}},");
}
if (releases.length) {
  console.log("\nTo use a new release, add its entry to config/source-files.js and its year to config/geo-config.js " +
    "(and config/vtiles-config.js if needed). If two releases share a year, choose one.");
}
