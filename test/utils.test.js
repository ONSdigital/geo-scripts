import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import zlib from "zlib";
import { gzipInPlace, csvParse, roundAll } from "../scripts/utils.js";

test("gzipInPlace gzips a file under the same name, and only once", () => {
  const dir = mkdtempSync(join(tmpdir(), "geo-scripts-"));
  try {
    const path = join(dir, "metadata.json");
    const json = '{"name": "wd25", "minzoom": "0"}\n';
    writeFileSync(path, json);

    assert.equal(gzipInPlace(path), true);
    const gzipped = readFileSync(path);
    assert.deepEqual([...gzipped.subarray(0, 2)], [0x1f, 0x8b]);
    assert.equal(zlib.gunzipSync(gzipped).toString(), json);

    // Running again leaves the file as it is
    assert.equal(gzipInPlace(path), false);
    assert.deepEqual(readFileSync(path), gzipped);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test("csvParse strips a byte order mark", () => {
  assert.deepEqual(csvParse("﻿areacd,n\nE06000001,1\n")[0], {areacd: "E06000001", n: 1});
});

test("roundAll rounds nested coordinates", () => {
  assert.deepEqual(roundAll([[1.23456789, 2], ["a", [3.1234567]]], 4), [[1.2346, 2], ["a", [3.1235]]]);
});
