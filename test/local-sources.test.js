import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readRecord, recordDownload, recordedOtherSource } from "../scripts/lib/local-sources.js";

test("the source record notes where each file came from, and spots changed datasets", () => {
  const dir = mkdtempSync(join(tmpdir(), "geo-scripts-"));
  try {
    const path = join(dir, "sources.json");
    assert.deepEqual(readRecord(path), {});
    recordDownload("wd25_bfc.json.gz", "WD_MAY_2025_UK_BFC", "geoportal", path);
    recordDownload("wd24_bfc.json.gz", "Wards_December_2024_Boundaries_UK_BFC", "archive", path);
    const record = readRecord(path);
    assert.equal(record["wd25_bfc.json.gz"].source, "WD_MAY_2025_UK_BFC");
    assert.equal(record["wd24_bfc.json.gz"].from, "archive");
    // The config now uses a different dataset for wd25_bfc
    assert.equal(recordedOtherSource(record, "wd25_bfc.json.gz", "WD_DEC_2025_UK_BFC"), "WD_MAY_2025_UK_BFC");
    assert.equal(recordedOtherSource(record, "wd24_bfc.json.gz", "Wards_December_2024_Boundaries_UK_BFC"), null);
    // Files downloaded before the record existed are assumed to match
    assert.equal(recordedOtherSource(record, "ctry22_bfc.json.gz", "Countries_December_2022_UK_BFC"), null);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
