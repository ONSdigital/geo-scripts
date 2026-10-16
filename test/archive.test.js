import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { tagFor, assetUrl, sha256File, getManifest, updateManifest } from "../scripts/lib/archive.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("tagFor names a release per geography and year", () => {
  assert.equal(tagFor({key: "wd", year: 2025, name: "wd25_bfc"}), "wd-2025");
  assert.equal(tagFor({name: "nspl.zip", href: "https://example.test"}), "other");
});

test("assetUrl points at a release download", () => {
  assert.equal(assetUrl("wd-2025", "wd25_bfc.json.gz", "Org/repo"), "https://github.com/Org/repo/releases/download/wd-2025/wd25_bfc.json.gz");
});

test("sha256File hashes a file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geo-scripts-"));
  try {
    writeFileSync(join(dir, "a.txt"), "hello\n");
    assert.equal(await sha256File(join(dir, "a.txt")), "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03");
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test("getManifest returns null for a release that doesn't exist, and caches manifests", async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls ++;
    return url.includes("/missing-2025/") ?
      new Response("Not Found", {status: 404}) :
      new Response(JSON.stringify({files: {"wd25_bfc.json.gz": {sha256: "abc"}}}));
  };
  assert.equal(await getManifest("missing-2025"), null);
  assert.equal((await getManifest("found-2025")).files["wd25_bfc.json.gz"].sha256, "abc");
  await getManifest("found-2025");
  assert.equal(calls, 2);
});

test("updateManifest keeps existing entries and replaces changed ones", () => {
  const existing = {files: {"a.json.gz": {sha256: "1"}, "b.json.gz": {sha256: "2"}}};
  const updated = updateManifest(existing, "wd-2025", {"b.json.gz": {sha256: "3"}, "c.json.gz": {sha256: "4"}});
  assert.equal(updated.tag, "wd-2025");
  assert.deepEqual(updated.files, {"a.json.gz": {sha256: "1"}, "b.json.gz": {sha256: "3"}, "c.json.gz": {sha256: "4"}});
});
