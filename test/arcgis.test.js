import { test } from "node:test";
import assert from "node:assert/strict";
import { parseServiceName, resolveFields, checkResponse, queryUrl, ArcGISError } from "../scripts/lib/arcgis.js";

test("parseServiceName handles the Geoportal's naming conventions", () => {
  const cases = {
    "LAD_MAY_2025_UK_BGC_V2": {family: "lad", month: "may", year: 2025, detail: "bgc", version: 2, variant: false},
    "Wards_December_2024_Boundaries_UK_BFC": {family: "wards", month: "dec", year: 2024, detail: "bfc", version: 0, variant: false},
    "Output_Areas_2021_EW_BFE_V9": {family: "output_areas", month: null, year: 2021, detail: "bfe", version: 9, variant: false},
    "Wards_(May_2026)_Boundaries_UK_BSC": {family: "wards", month: "may", year: 2026, detail: "bsc", version: 0, variant: false},
    "Travel_to_Work_Areas_Dec_2011_FEB_in_United_Kingdom_2022": {family: "travel_to_work_areas", month: "dec", year: 2011, detail: "bfe", version: 0, variant: false},
    "OA_December_2021_EW_PWC_V4": {family: "oa", month: "dec", year: 2021, detail: "pwc", version: 4, variant: false},
    "LSOA_2021_EW_BFE_V10_RUC": {family: "lsoa", month: null, year: 2021, detail: "bfe", version: 10, variant: true},
    "WD_MAY_2026_UK_NC": {family: "wd", month: "may", year: 2026, detail: null, version: 0, variant: true}
  };
  for (const [name, expected] of Object.entries(cases)) {
    const parsed = parseServiceName(name);
    for (const [key, value] of Object.entries(expected)) assert.equal(parsed[key], value, `${name}: ${key}`);
  }
});

test("parseServiceName treats singular and plural prefixes as the same family", () => {
  assert.equal(
    parseServiceName("Lower_Layer_Super_Output_Area_2021_EW_BFE_V8").familyKey,
    parseServiceName("Lower_layer_Super_Output_Areas_December_2021_Boundaries_EW_BFE_V10").familyKey
  );
});

test("parseServiceName returns null for names without a year", () => {
  assert.equal(parseServiceName("Some_Lookup_Table"), null);
  assert.equal(parseServiceName("2021_Only"), null);
});

test("resolveFields matches field names case-insensitively", () => {
  const fields = [{name: "FID"}, {name: "lad25cd"}, {name: "LAD25NM"}, {name: "LAD25NMW"}];
  assert.deepEqual(resolveFields(fields, "LAD", "25"), [
    {key: "lad25cd", label: "areacd"},
    {key: "LAD25NM", label: "areanm"},
    {key: "LAD25NMW", label: "areanmw"}
  ]);
});

test("resolveFields requires a code field and lists what was found", () => {
  const fields = [{name: "FID"}, {name: "WD24CD"}, {name: "WD24NM"}];
  assert.throws(() => resolveFields(fields, "WD", "25"), /Expected a WD25CD field but found WD24CD/);
});

test("checkResponse flags retired datasets as unavailable", () => {
  const retired = {error: {code: 499, message: "Token Required", details: ["Token Required"]}};
  assert.throws(() => checkResponse(retired, "LAD_MAY_2025_UK_BGC"), (err) =>
    err instanceof ArcGISError && err.unavailable && !err.retryable &&
    /LAD_MAY_2025_UK_BGC.*Token Required\. It may have been retired/.test(err.message)
  );
  const missing = {error: {code: 400, message: "Invalid URL", details: ["Invalid URL"]}};
  assert.throws(() => checkResponse(missing, "X"), (err) => err.unavailable);
});

test("checkResponse treats other errors as retryable", () => {
  const busy = {error: {code: 500, message: "Error performing query operation", details: []}};
  assert.throws(() => checkResponse(busy, "X"), (err) => !err.unavailable && err.retryable);
  assert.deepEqual(checkResponse({count: 4}, "X"), {count: 4});
});

test("queryUrl pages in a stable order", () => {
  const url = new URL(queryUrl("WD_MAY_2026_UK_BGC", {offset: 2000, limit: 1000, orderBy: "FID"}));
  assert.equal(url.searchParams.get("resultOffset"), "2000");
  assert.equal(url.searchParams.get("resultRecordCount"), "1000");
  assert.equal(url.searchParams.get("orderByFields"), "FID");
  assert.equal(url.searchParams.get("outSR"), "4326");
});
