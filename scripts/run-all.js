// Runs the data preparation steps in order, stopping at the first failure:
//   download-files → archive-sources → make-virtual-boundaries → get-metadata →
//   get-relations → make-lists → get-best-fits
// These produce the lookups and lists. The large outputs (make-geos, make-vtiles,
// make-postcodes, make-search-tiles, ...) aren't included: they each depend only on
// what these steps produce, so run whichever you need afterwards. Run check-sources
// first if you want to check for new or changed source files.
//
// Usage: npm run run-all -- [--geo ltla,wd] [--year 2025] [--no-archive]
// A selection is passed on to the steps that support it. get-metadata and
// get-relations always process every geography, as the master lookup needs them all.
import { spawnSync } from "child_process";
import { cli } from "./lib/cli.js";

const usage = `Usage: npm run run-all -- [--geo ltla,wd] [--year 2025] [--no-archive]
  --geo, --year  limit downloads, archiving and lists to these geographies/years
  --no-archive   skip archiving the source files (archiving needs write access to the
                 archive repo; without it, the step is skipped with a warning)`;
const {opts} = cli(usage, () => null, {"no-archive": {type: "boolean", default: false}});

const selection = [
  ...(opts.geo ? ["--geo", opts.geo.join(",")] : []),
  ...(opts.year ? ["--year", opts.year.join(",")] : [])
];
const geoOnly = opts.geo ? ["--geo", opts.geo.join(",")] : [];

// [script, args, whether the run can continue if it fails]
const steps = [
  ["download-files", selection],
  ...(opts["no-archive"] ? [] : [["archive-sources", selection, true]]),
  ["make-virtual-boundaries", []],
  ["get-metadata", []],
  ["get-relations", []],
  ["make-lists", selection],
  // Best-fits combine every year of a geography, so only take --geo
  ["get-best-fits", geoOnly]
];

if (opts.year) {
  console.log("Note: get-best-fits ignores --year, and processes every year of the selected geographies.\n");
}

const startTime = new Date();
const warnings = [];
for (const [script, args, optional] of steps) {
  console.log(`\n=== ${script} ${args.join(" ")} ===`);
  const result = spawnSync(process.execPath, [`./scripts/${script}.js`, ...args], {stdio: "inherit"});
  if (result.status !== 0) {
    if (optional) {
      warnings.push(`${script} failed (exit code ${result.status}), so it was skipped`);
      console.warn(`\n${script} failed. Continuing without it.`);
      continue;
    }
    console.error(`\n${script} failed (exit code ${result.status}). Stopping.`);
    process.exit(result.status || 1);
  }
}
const duration = Math.round((new Date() - startTime) / 1000);
console.log(`\nAll steps completed in ${duration.toLocaleString()} seconds.`);
for (const warning of warnings) console.warn(`Warning: ${warning}`);
console.log("Now run whichever outputs you need, eg. npm run make-geos, make-vtiles, make-postcodes or make-search-tiles.");
