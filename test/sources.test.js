import { test } from "node:test";
import assert from "node:assert/strict";
import { expandGeoSources, checkManifest, findNewReleases, codesInYear, compareCodes, renamedCodes, datasetsBySize } from "../scripts/lib/sources.js";

const manifest = expandGeoSources([
  {key: "ltla", year: 2025, code: "LAD", ids: {
    bfe: "LAD_MAY_2025_UK_BFE",
    bgc: "LAD_MAY_2025_UK_BGC_V2",
    buc: "LAD_MAY_2025_UK_BSC"
  }},
  {key: "ltla", year: 2023, code: "LAD", ids: {
    bfe: "Local_Authority_Districts_May_2023_UK_BFE"
  }},
  {key: "wd", year: 2024, code: "WD", ids: {
    bfc: "Wards_May_2024_Boundaries_UK_BFC"
  }}
]);

const catalogue = [
  "LAD_MAY_2025_UK_BFE_V2",
  "LAD_MAY_2025_UK_BGC_V2",
  "LAD_MAY_2025_UK_BGC_V3",
  "LAD_MAY_2025_UK_BSC_V2",
  "LAD_MAY_2025_UK_BUC",
  "LAD_MAY_2025_UK_NC",
  "Local_Authority_Districts_May_2026_Boundaries_UK_BFE",
  "Local_Authority_Districts_May_2026_Boundaries_UK_BSC",
  "LAD_DEC_2024_UK_BFE",
  "Wards_May_2024_Boundaries_UK_BFC",
  "Local_Authority_Districts_December_2023_UK_BFE",
  "Wards_December_2024_Boundaries_UK_BFC",
  "WD_MAY_2025_UK_BFC",
  "WD_DEC_2025_UK_BFC",
  "WD_DEC_2025_UK_BFC_V2",
  "WD_DEC_2025_UK_BFC_RUC"
];

test("expandGeoSources makes one file per detail level", () => {
  assert.deepEqual(manifest.map(f => f.name), ["ltla25_bfe", "ltla25_bgc", "ltla25_buc", "ltla23_bfe", "wd24_bfc"]);
  assert.deepEqual(manifest[0], {name: "ltla25_bfe", key: "ltla", year: 2025, detail: "bfe", id: "LAD_MAY_2025_UK_BFE", code: "LAD"});
});

test("checkManifest suggests replacements for missing datasets", () => {
  const results = Object.fromEntries(checkManifest(manifest, catalogue).map(r => [r.file.name, r]));
  assert.equal(results.ltla25_bfe.status, "missing");
  assert.deepEqual(results.ltla25_bfe.candidates, ["LAD_MAY_2025_UK_BFE_V2"]);
  // A BUC slot prefers a real BUC, then falls back to BSC
  assert.deepEqual(results.ltla25_buc.candidates, ["LAD_MAY_2025_UK_BUC", "LAD_MAY_2025_UK_BSC_V2"]);
  assert.equal(results.wd24_bfc.status, "ok");
});

test("checkManifest flags datasets with a newer version", () => {
  const result = checkManifest(manifest, catalogue).find(r => r.file.name === "ltla25_bgc");
  assert.equal(result.status, "outdated");
  assert.deepEqual(result.candidates, ["LAD_MAY_2025_UK_BGC_V3"]);
});

test("findNewReleases suggests the latest release in each calendar year", () => {
  assert.deepEqual(findNewReleases(manifest, catalogue), [
    // A later release within a year already in the manifest
    {key: "ltla", code: "LAD", year: 2023, month: "dec", status: "update", ids: {
      bfe: "Local_Authority_Districts_December_2023_UK_BFE"
    }, missing: []},
    // A new year, with the detail levels of the latest year in the manifest. BUC falls
    // back to BSC, and details the release doesn't have are listed as missing.
    // (LAD_DEC_2024 is ignored: 2024 is between configured years, so it was left out deliberately.)
    {key: "ltla", code: "LAD", year: 2026, month: "may", status: "new", ids: {
      bfe: "Local_Authority_Districts_May_2026_Boundaries_UK_BFE",
      buc: "Local_Authority_Districts_May_2026_Boundaries_UK_BSC"
    }, missing: ["bgc"]},
    {key: "wd", code: "WD", year: 2024, month: "dec", status: "update", ids: {
      bfc: "Wards_December_2024_Boundaries_UK_BFC"
    }, missing: []},
    // Only the December release for 2025 (not May), at its highest version, ignoring _RUC variants
    {key: "wd", code: "WD", year: 2025, month: "dec", status: "new", ids: {
      bfc: "WD_DEC_2025_UK_BFC_V2"
    }, missing: []}
  ]);
});

test("codesInYear uses start/end years from the lookup", () => {
  const rows = [
    {areacd: "E07000001"},
    {areacd: "E07000002", end: 2022},
    {areacd: "E06000099", start: 2023},
    {areacd: "E05000001"}
  ];
  assert.deepEqual([...codesInYear(rows, ["E06", "E07"], 2022)], ["E07000001", "E07000002"]);
  assert.deepEqual([...codesInYear(rows, ["E06", "E07"], 2025)], ["E07000001", "E06000099"]);
});

test("compareCodes finds new and ended codes of the configured types only", () => {
  const before = new Set(["E05000001", "E05000002", "W05000001"]);
  const after = ["E05000001", "E05000003", "W05000001", "S13000001", "N08000001"];
  assert.deepEqual(compareCodes(before, after, ["E05", "W05"]), {
    added: ["E05000003"],
    removed: ["E05000002"],
    otherPrefixes: ["N08", "S13"]
  });
  const same = compareCodes(before, ["W05000001", "E05000002", "E05000001", "S13000001"], ["E05", "W05"]);
  assert.deepEqual([same.added, same.removed], [[], []]);
});

test("datasetsBySize lists the quickest datasets to query first", () => {
  assert.deepEqual(datasetsBySize({bfe: "A_BFE", bfc: "A_BFC", bgc: "A_BGC", bsc: "A_BSC"}), ["A_BSC", "A_BGC", "A_BFC", "A_BFE"]);
});

test("renamedCodes finds areas whose name changed but code didn't", () => {
  const before = new Map([["E07000083", "Tewkesbury"], ["E07000084", "Basingstoke and Deane"], ["E05000001", "A ward"]]);
  const after = new Map([["E07000083", "North Gloucestershire"], ["E07000084", "Basingstoke and Deane "], ["E07000999", "New"], ["E05000001", "Renamed ward"]]);
  assert.deepEqual(renamedCodes(before, after, ["E07"]), ["E07000083"]);
});

test("checkLookups finds newer editions and versions of lookups", async () => {
  const { checkLookups } = await import("../scripts/lib/sources.js");
  const lookups = [
    {key: "census", id: "OA_LSOA_MSOA_EW_DEC_2021_LU_v3", join: {id: "LAD22_RGN22_EN_LU", on: {ltla22cd: "LAD22CD"}, columns: {RGN22CD: "rgn22cd"}}},
    {key: "nspl", id: "National_Statistics_Postcode_Lookup_(May_2026)_for_the_United_Kingdom"},
    {key: "msoa_names", href: "https://example.test/latest.csv"}
  ];
  const catalogue = [
    "OA_LSOA_MSOA_EW_DEC_2021_LU_v3",
    "OA_LSOA_MSOA_EW_DEC_2021_LU_v4",
    "LAD22_RGN22_EN_LU",
    "National_Statistics_Postcode_Lookup_(February_2026)_for_the_UK_(Hosted_Table)",
    "National_Statistics_Postcode_Lookup_(August_2026)_for_the_United_Kingdom_(Hosted_Table)",
    "NSPL_Online_latest_Centroids"
  ];
  assert.deepEqual(checkLookups(lookups, catalogue).map(r => [r.lookup.key, r.listed, r.newer]), [
    ["census", true, "OA_LSOA_MSOA_EW_DEC_2021_LU_v4"],
    // The joined table is checked too, with the columns it needs
    ["census-join", true, null],
    ["nspl", false, "National_Statistics_Postcode_Lookup_(August_2026)_for_the_United_Kingdom_(Hosted_Table)"]
  ]);
});

test("datasets are matched by title as well as service name", async () => {
  const { parseDataset, titleToName } = await import("../scripts/lib/sources.js");
  const titles = new Map([
    ["main_ONS_BUA_2024_EW_V2", "Built Up Areas (December 2024) Boundaries EW BGG (V2)"],
    ["BUA_2022_GB", "Built Up Areas (December 2022) Boundaries GB BGG"]
  ]);
  assert.equal(titleToName("Built Up Areas (December 2024) Boundaries EW BGG (V2)"), "Built_Up_Areas_December_2024_Boundaries_EW_BGG_V2");
  // The release comes from the title (BGG is treated as BFC), and either family matches
  const parsed = parseDataset("main_ONS_BUA_2024_EW_V2", titles);
  assert.deepEqual(parsed.map(p => [p.name, p.familyKey, p.year, p.month, p.detail, p.version]), [
    ["main_ONS_BUA_2024_EW_V2", "main_on_bua", 2024, "dec", "bfc", 2],
    ["main_ONS_BUA_2024_EW_V2", "built_up_area", 2024, "dec", "bfc", 2]
  ]);

  const manifest = expandGeoSources([{key: "bua", year: 2022, code: "BUA", ids: {bfc: "BUA_2022_GB"}}]);
  const catalogue = ["BUA_2022_GB", "main_ONS_BUA_2024_EW_V2", "BUA_APR_2024_EW_NC"];
  assert.deepEqual(checkManifest(manifest, catalogue, titles).map(r => r.status), ["ok"]);
  assert.deepEqual(findNewReleases(manifest, catalogue, titles).map(r => [r.key, r.year, r.status, r.ids]), [
    ["bua", 2024, "new", {bfc: "main_ONS_BUA_2024_EW_V2"}]
  ]);
  // Without titles, the oddly named 2024 dataset isn't recognised
  assert.deepEqual(findNewReleases(manifest, catalogue), []);
});
