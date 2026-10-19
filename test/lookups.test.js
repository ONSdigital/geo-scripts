import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import zlib from "zlib";
import { writeLookup } from "../scripts/lib/lookups.js";

const csv = "\uFEFFOA21CD,LSOA21NM,LAD22CD,ObjectId\nE00000001,\"City of London 001A\",E09000001,1\nE00000003,\"Kingston upon Hull, City of 001A\",E06000010,2\n";

test("writeLookup keeps and renames chosen columns, handling quoted commas", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geo-scripts-"));
  try {
    writeFileSync(join(dir, "in.csv"), csv);
    const rows = await writeLookup(join(dir, "in.csv"), join(dir, "out.csv"), {columns: {OA21CD: "oa21cd", LAD22CD: "ltla22cd"}});
    assert.equal(rows, 2);
    assert.equal(readFileSync(join(dir, "out.csv"), "utf8"), "oa21cd,ltla22cd\nE00000001,E09000001\nE00000003,E06000010\n");
    await assert.rejects(writeLookup(join(dir, "in.csv"), join(dir, "bad.csv"), {columns: {NOPE: "x"}}), /Missing columns NOPE/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test("writeLookup copies every column to a gzipped file, dropping the byte order mark", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geo-scripts-"));
  try {
    writeFileSync(join(dir, "in.csv"), csv);
    const rows = await writeLookup(join(dir, "in.csv"), join(dir, "out.csv.gz"));
    assert.equal(rows, 2);
    assert.equal(zlib.gunzipSync(readFileSync(join(dir, "out.csv.gz"))).toString(), csv.replace("\uFEFF", ""));
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test("writeLookup checks required columns", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geo-scripts-"));
  try {
    writeFileSync(join(dir, "in.csv"), "pcds,lat,long\nAB1 0AA,57.1,-2.2\n");
    assert.equal(await writeLookup(join(dir, "in.csv"), join(dir, "ok.csv.gz"), {required: ["pcds", "lat", "long"]}), 1);
    await assert.rejects(writeLookup(join(dir, "in.csv"), join(dir, "bad.csv.gz"), {required: ["pcd7"]}), /Missing columns pcd7/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
