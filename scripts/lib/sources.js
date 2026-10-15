// Helpers for the grouped source manifest in config/source-files.js
import { yy } from "../../config/paths.js";
import { parseServiceName } from "./arcgis.js";

// Expand {key, year, code, ids: {detail: id}} entries into one file per detail level
export function expandGeoSources(entries = []) {
  return entries.flatMap(({key, year, code, ids}) =>
    Object.entries(ids).map(([detail, id]) => ({name: `${key}${yy(year)}_${detail}`, key, year, detail, id, code}))
  );
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const releaseOrder = (p) => p.year * 12 + (p.month ? MONTHS.indexOf(p.month) : 0);
const byVersion = (a, b) => b.version - a.version || a.name.localeCompare(b.name);

// The dataset name prefixes ("families") used for each geography, eg. ltla -> lad,
// local_authority_districts. Taken from the manifest's own IDs, plus the field code,
// so a release under a prefix the manifest has never used won't be found.
export function familiesByKey(files) {
  const families = {};
  for (const file of files) {
    families[file.key] ||= new Set();
    families[file.key].add(file.code.toLowerCase().replace(/s$/, ""));
    const parsed = parseServiceName(file.id);
    if (parsed) families[file.key].add(parsed.familyKey);
  }
  return families;
}

// Check each manifest file against the catalogue of available dataset names.
// Returns one result per file: {file, status: "ok" | "missing" | "outdated", candidates}
export function checkManifest(files, catalogue) {
  const available = new Set(catalogue);
  const parsed = catalogue.map(parseServiceName).filter(p => p && p.detail && !p.variant);
  const families = familiesByKey(files);

  return files.map(file => {
    const orig = parseServiceName(file.id);
    if (!orig) return {file, status: available.has(file.id) ? "ok" : "missing", candidates: []};
    // Prefer the detail level of the slot (eg. buc) over the one currently used (eg. bsc)
    const details = [...new Set([file.detail, orig.detail, ...(file.detail === "buc" ? ["bsc"] : [])])].filter(d => d);
    const sameRelease = parsed.filter(p =>
      families[file.key].has(p.familyKey) &&
      p.year === orig.year &&
      (!orig.month || !p.month || p.month === orig.month)
    );

    if (available.has(file.id)) {
      // Flag a newer version of the same dataset, eg. _V2 -> _V3
      const newer = sameRelease
        .filter(p => p.familyKey === orig.familyKey && p.detail === orig.detail && p.version > orig.version)
        .sort(byVersion);
      return {file, status: newer.length ? "outdated" : "ok", candidates: newer.map(p => p.name)};
    }
    const candidates = details.flatMap(d => sameRelease.filter(p => p.detail === d).sort(byVersion));
    return {file, status: "missing", candidates: candidates.map(p => p.name)};
  });
}

// Find releases newer than the latest one in the manifest for each geography.
// Returns [{key, code, year, month, ids: {detail: name}}], oldest first.
export function findNewReleases(files, catalogue) {
  const parsed = catalogue.map(parseServiceName).filter(p => p && p.detail && !p.variant);
  const families = familiesByKey(files);
  const releases = [];

  for (const key of Object.keys(families)) {
    const keyFiles = files.filter(f => f.key === key);
    const latest = Math.max(...keyFiles.map(f => parseServiceName(f.id)).filter(p => p).map(releaseOrder));
    const details = new Set(keyFiles.map(f => f.detail));
    const groups = {};
    for (const p of parsed) {
      if (!families[key].has(p.familyKey) || releaseOrder(p) <= latest) continue;
      const id = `${p.year}-${p.month || ""}`;
      groups[id] ||= {key, code: keyFiles[0].code, year: p.year, month: p.month, options: {}};
      (groups[id].options[p.detail] ||= []).push(p);
    }
    for (const group of Object.values(groups)) {
      const ids = {};
      for (const detail of details) {
        // Use BSC for a BUC slot when no BUC has been published
        const options = group.options[detail] || (detail === "buc" ? group.options.bsc : null);
        if (options) ids[detail] = options.sort(byVersion)[0].name;
      }
      if (Object.keys(ids).length) releases.push({key, code: group.code, year: group.year, month: group.month, ids});
    }
  }
  return releases.sort((a, b) => a.key.localeCompare(b.key) || releaseOrder(a) - releaseOrder(b));
}
