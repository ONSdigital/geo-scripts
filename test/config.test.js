// Consistency checks for the config files, which the scripts rely on but don't validate
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import geo_config from "../config/geo-config.js";
import geo_types from "../config/geo-types.js";
import source_files from "../config/source-files.js";
import vtiles_config from "../config/vtiles-config.js";
import { yy } from "../config/paths.js";
import { expandGeoSources } from "../scripts/lib/sources.js";

// Boundary files available to the scripts: those downloaded, plus any committed to the
// repo (whitelisted in .gitignore, eg. the UK boundaries)
const committed = readFileSync(new URL("../.gitignore", import.meta.url), "utf8")
  .split("\n")
  .map(line => line.match(/^!\/input\/boundaries\/(.+)\.json\.gz$/)?.[1])
  .filter(name => name);
const boundaries = new Set([...expandGeoSources(source_files.boundaries).map(f => f.name), ...committed]);
const has = (key, year, detail) => boundaries.has(`${key}${yy(year)}_${detail}`);

test("geography keys and type codes are unique", () => {
  const keys = geo_config.map(g => g.key);
  assert.deepEqual(keys, [...new Set(keys)]);
  const codes = geo_config.flatMap(g => g.codes);
  assert.deepEqual(codes, [...new Set(codes)]);
});

test("geographies are listed in hierarchy order (parents before children)", () => {
  // get-relations relies on this to find every parent
  const seen = new Set();
  for (const geo of geo_config) {
    for (const parent of geo.parents) {
      assert.ok(seen.has(parent), `${geo.key} has parent ${parent}, which must belong to a geography listed before it`);
    }
    for (const code of geo.codes) seen.add(code);
  }
});

test("type names are for configured type codes", () => {
  const codes = new Set(geo_config.flatMap(g => g.codes));
  for (const code of Object.keys(geo_types)) assert.ok(codes.has(code), `${code} in geo-types.js`);
});

test("every configured geography and year has the boundary files the scripts need", () => {
  for (const geo of geo_config) {
    for (const year of geo.years) {
      const label = `${geo.key}${yy(year)}`;
      assert.ok(has(geo.key, year, "bfc"), `${label}_bfc (used by get-metadata)`);
      assert.ok(has(geo.key, year, "bfe") || has(geo.key, year, "bfc"), `${label}_bfe or _bfc (used by get-relations)`);
      assert.ok(has(geo.key, year, geo.detail || "bgc"), `${label}_${geo.detail || "bgc"} (used by make-geos)`);
    }
  }
});

test("source manifest entries are unique and match the geography config", () => {
  for (const type of ["boundaries", "centroids"]) {
    const names = expandGeoSources(source_files[type]).map(f => f.name);
    assert.deepEqual(names, [...new Set(names)], `duplicate ${type} entries`);
  }
  for (const entry of source_files.boundaries) {
    const geo = geo_config.find(g => g.key === entry.key);
    assert.ok(geo?.years.includes(entry.year), `${entry.key} ${entry.year} is in source-files.js but not geo-config.js`);
    assert.match(entry.code, /^[A-Za-z]+$/, `${entry.key} ${entry.year} code`);
  }
});

test("vector tile sources exist and share the same detail levels", () => {
  const keys = vtiles_config.map(t => `${t.key}${t.year}`);
  assert.deepEqual(keys, [...new Set(keys)], "duplicate tilesets");
  for (const tileset of vtiles_config) {
    const sources = tileset.sources || [tileset];
    // make-vtiles uses the detail levels available for the first source for all of them
    const details = ["buc", "bsc", "bgc", "bfc"].filter(d => has(sources[0].key, sources[0].year, d));
    assert.ok(details.length > 0, `${tileset.key} ${tileset.year} has no boundary files`);
    for (const source of sources) {
      for (const detail of details) {
        assert.ok(has(source.key, source.year, detail), `${tileset.key} ${tileset.year} needs ${source.key}${yy(source.year)}_${detail}`);
      }
    }
  }
});

test("tilesets get a version for each year any source has boundaries for", async () => {
  const { expandTilesets } = await import("../config/vtiles-config.js");
  const years = {ltla: [2022, 2023, 2025], cty: [2022, 2023], cauth: [2022, 2024, 2025], wd: [2023, 2024]};
  const tilesets = expandTilesets([{key: "la", sources: [{key: "ltla"}, {key: "cty"}, {key: "cauth"}]}, {key: "wd", minzoom: 6}], k => years[k]);
  assert.deepEqual(tilesets.map(t => `${t.key}${t.year}: ${t.sources.map(s => s.key + s.year).join(" ")}`), [
    "la2022: ltla2022 cty2022 cauth2022",
    "la2023: ltla2023 cty2023 cauth2022",
    "la2024: ltla2023 cty2023 cauth2024",
    "la2025: ltla2025 cty2023 cauth2025",
    "wd2023: wd2023",
    "wd2024: wd2024"
  ]);
  assert.equal(tilesets.find(t => t.key === "wd").minzoom, 6);
});
