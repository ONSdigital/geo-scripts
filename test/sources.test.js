import { test } from "node:test";
import assert from "node:assert/strict";
import { expandGeoSources, checkManifest, findNewReleases } from "../scripts/lib/sources.js";

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
  "Local_Authority_Districts_May_2026_Boundaries_UK_BGC",
  "Local_Authority_Districts_May_2026_Boundaries_UK_BSC",
  "LAD_DEC_2024_UK_BFE",
  "Wards_May_2024_Boundaries_UK_BFC",
  "WD_DEC_2025_UK_BFC",
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

test("findNewReleases lists newer releases with the manifest's detail levels", () => {
  assert.deepEqual(findNewReleases(manifest, catalogue), [
    {key: "ltla", code: "LAD", year: 2026, month: "may", ids: {
      bfe: "Local_Authority_Districts_May_2026_Boundaries_UK_BFE",
      bgc: "Local_Authority_Districts_May_2026_Boundaries_UK_BGC",
      buc: "Local_Authority_Districts_May_2026_Boundaries_UK_BSC"
    }},
    // Only the detail levels the manifest uses (bfc), ignoring variants like _RUC
    {key: "wd", code: "WD", year: 2025, month: "dec", ids: {bfc: "WD_DEC_2025_UK_BFC"}}
  ]);
});
