// Command-line options shared by the scripts, eg.
//   npm run make-geos -- --geo ltla,wd --year 2025
// Selections apply to entries in config/geo-config.js (or config/vtiles-config.js
// for vector tiles), so there's no need to comment out parts of the config.
import { parseArgs } from "util";

const list = (str) => str ? str.split(",").map(s => s.trim()).filter(s => s) : null;

export function parseOptions(args = process.argv.slice(2), extra = {}) {
  const {values} = parseArgs({
    args,
    options: {
      geo: {type: "string"},
      year: {type: "string"},
      force: {type: "boolean", default: false},
      clean: {type: "boolean", default: false},
      help: {type: "boolean", default: false},
      ...extra
    }
  });
  const years = list(values.year)?.map(Number);
  if (years?.some(y => !Number.isInteger(y) || y < 1900)) throw new Error(`--year must be four-digit years, eg. --year 2024,2025`);
  return {...values, geo: list(values.geo), year: years};
}

function checkKeys(keys, available, label) {
  const unknown = (keys || []).filter(k => !available.includes(k));
  if (unknown.length > 0) {
    throw new Error(`Unknown ${label} ${unknown.join(", ")}. Available: ${[...new Set(available)].join(", ")}`);
  }
}

// Filter geo-config entries (and their years) by --geo and --year.
// Set years: false for outputs that combine every year of a geography (eg. one file
// per area, taken from the newest year it appears in), where --year would be unsafe.
export function selectGeos(config, {geo, year} = {}, {years = true} = {}) {
  if (year && !years) throw new Error("--year isn't supported here, because each output combines every year of a geography");
  checkKeys(geo, config.map(g => g.key), "geography");
  const selected = config
    .filter(g => !geo || geo.includes(g.key))
    .map(g => ({...g, years: year ? g.years.filter(y => year.includes(y)) : g.years}))
    .filter(g => g.years.length > 0);
  if (selected.length === 0) throw new Error("No geographies match the selected --geo and --year");
  return selected;
}

// Filter vtiles-config entries by --geo (tileset key) and --year
export function selectTilesets(config, {geo, year} = {}) {
  checkKeys(geo, config.map(t => t.key), "tileset");
  const selected = config.filter(t => (!geo || geo.includes(t.key)) && (!year || year.includes(t.year)));
  if (selected.length === 0) throw new Error("No tilesets match the selected --geo and --year");
  return selected;
}

export const isSelection = (opts) => Boolean(opts.geo || opts.year);

// Parse options and apply a selection, printing errors and usage instead of a stack trace
export function cli(usage, select = () => null, extra) {
  try {
    const opts = parseOptions(undefined, extra);
    if (opts.help) {
      console.log(usage);
      process.exit(0);
    }
    return {opts, selected: select(opts)};
  } catch (err) {
    console.error(`${err.message}\n\n${usage}`);
    process.exit(1);
  }
}

// For scripts that must always process every geography
export function rejectSelection(opts, reason) {
  if (isSelection(opts)) {
    console.error(`This script doesn't support --geo or --year: ${reason}`);
    process.exit(1);
  }
}
