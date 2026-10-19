import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import zlib from "zlib";
import { writeLookup, joinColumns } from "../scripts/lib/lookups.js";

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

test("writeLookup adds columns joined from another table, with a fallback for Welsh authorities", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geo-scripts-"));
  try {
    writeFileSync(join(dir, "in.csv"), "\uFEFFOA21CD,LAD22CD\nE00000001,E09000001\nW00000001,W06000001\n");
    const regions = [{LAD22CD: "E09000001", RGN22CD: "E12000007"}];
    const join_config = {on: {ltla22cd: "LAD22CD"}, columns: {RGN22CD: "rgn22cd"}, fallback: {W: {rgn22cd: "W92000004"}}};
    const addColumns = joinColumns(regions, join_config);
    const rows = await writeLookup(join(dir, "in.csv"), join(dir, "out.csv"), {columns: {OA21CD: "oa21cd", LAD22CD: "ltla22cd"}, addColumns});
    assert.equal(rows, 2);
    assert.equal(readFileSync(join(dir, "out.csv"), "utf8"), "oa21cd,ltla22cd,rgn22cd\nE00000001,E09000001,E12000007\nW00000001,W06000001,W92000004\n");
    // An English authority missing from the region lookup is an error, not a blank
    writeFileSync(join(dir, "missing.csv"), "OA21CD,LAD22CD\nE00000002,E06000999\n");
    await assert.rejects(writeLookup(join(dir, "missing.csv"), join(dir, "bad.csv"), {columns: {OA21CD: "oa21cd", LAD22CD: "ltla22cd"}, addColumns}), /E06000999 \(ltla22cd\) isn't in the joined table/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
