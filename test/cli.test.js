import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOptions, selectGeos, selectTilesets, isSelection } from "../scripts/lib/cli.js";

const config = [
  {key: "ctry", codes: ["E92"], years: [2022]},
  {key: "ltla", codes: ["E07"], years: [2022, 2023, 2025]},
  {key: "wd", codes: ["E05"], years: [2023, 2024, 2025]}
];

test("parseOptions splits comma-separated lists", () => {
  const opts = parseOptions(["--geo", "ltla, wd", "--year", "2024,2025", "--force"]);
  assert.deepEqual(opts.geo, ["ltla", "wd"]);
  assert.deepEqual(opts.year, [2024, 2025]);
  assert.equal(opts.force, true);
  assert.equal(isSelection(opts), true);
  assert.equal(isSelection(parseOptions([])), false);
});

test("parseOptions rejects unknown options and bad years", () => {
  assert.throws(() => parseOptions(["--geos", "ltla"]), /Unknown option/);
  assert.throws(() => parseOptions(["--year", "25"]), /four-digit/);
});

test("selectGeos returns everything when there is no selection", () => {
  assert.deepEqual(selectGeos(config, {}), config);
});

test("selectGeos filters geographies and their years", () => {
  assert.deepEqual(selectGeos(config, {geo: ["ltla"], year: [2025]}), [{key: "ltla", codes: ["E07"], years: [2025]}]);
  assert.deepEqual(selectGeos(config, {year: [2025]}).map(g => g.key), ["ltla", "wd"]);
});

test("selectGeos rejects unknown keys, empty selections and unsupported --year", () => {
  assert.throws(() => selectGeos(config, {geo: ["ward"]}), /Unknown geography ward\. Available: ctry, ltla, wd/);
  assert.throws(() => selectGeos(config, {geo: ["ctry"], year: [2025]}), /No geographies match/);
  assert.throws(() => selectGeos(config, {year: [2025]}, {years: false}), /--year isn't supported/);
});

test("selectTilesets filters by key and year", () => {
  const tilesets = [{key: "la", year: 2024}, {key: "la", year: 2025}, {key: "wd", year: 2025}];
  assert.deepEqual(selectTilesets(tilesets, {geo: ["la"], year: [2025]}), [{key: "la", year: 2025}]);
  assert.throws(() => selectTilesets(tilesets, {geo: ["ltla"]}), /Unknown tileset/);
});
