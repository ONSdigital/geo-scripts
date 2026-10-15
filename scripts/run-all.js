// Runs the main pipeline in order (everything except the vector tile, postcode and
// search tile scripts), stopping at the first failure.
//
// Usage: npm run all-scripts -- [--geo ltla,wd] [--year 2025]
// A selection is passed on to the steps that support it. get-metadata and
// get-relations always process every geography, as the master lookup needs them all.
import { spawnSync } from "child_process";
import { cli } from "./lib/cli.js";

const usage = `Usage: npm run all-scripts -- [--geo ltla,wd] [--year 2025]
  --geo, --year  limit downloads and outputs to these geographies/years`;
const {opts} = cli(usage);

const selection = [
  ...(opts.geo ? ["--geo", opts.geo.join(",")] : []),
  ...(opts.year ? ["--year", opts.year.join(",")] : [])
];
const geoOnly = opts.geo ? ["--geo", opts.geo.join(",")] : [];

const steps = [
  ["download-files", selection],
  ["get-metadata", []],
  ["get-relations", []],
  ["make-lists", selection],
  // Best-fits and area files combine every year of a geography, so only take --geo
  ["get-best-fits", geoOnly],
  ["make-geos", geoOnly]
];

if (opts.year) {
  console.log("Note: get-best-fits and make-geos ignore --year, and process every year of the selected geographies.\n");
}

const startTime = new Date();
for (const [script, args] of steps) {
  console.log(`\n=== ${script} ${args.join(" ")} ===`);
  const result = spawnSync(process.execPath, [`./scripts/${script}.js`, ...args], {stdio: "inherit"});
  if (result.status !== 0) {
    console.error(`\n${script} failed (exit code ${result.status}). Stopping.`);
    process.exit(result.status || 1);
  }
}
const duration = Math.round((new Date() - startTime) / 1000);
console.log(`\nAll steps completed in ${duration.toLocaleString()} seconds.`);
