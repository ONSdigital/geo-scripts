import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { tagFor, assetUrl, sha256File, getManifest, updateManifest, planPrune } from "../scripts/lib/archive.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("tagFor names a release per geography and year", () => {
  assert.equal(tagFor({key: "wd", year: 2025, name: "wd25_bfc"}), "wd-2025");
  assert.equal(tagFor({key: "nspl", name: "nspl.csv.gz"}), "lookups");
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

test("planPrune removes files and releases the config no longer names", () => {
  const configured = new Map([
    ["lookups", new Set(["oa21_lsoa21_msoa21_ltla22_rgn22.csv", "nspl.csv.gz", "msoa_names.csv"])],
    ["wd-2025", new Set(["wd25_bfc.json.gz", "wd25_bgc.json.gz"])]
  ]);
  const entry = {sha256: "abc"};
  const archived = new Map([
    // A renamed file: the old name is still in the release and its manifest
    ["lookups", {
      assets: ["manifest.json", "msoa_names.csv", "nspl.csv.gz", "oa21_lsoa21_msoa21_ltla22.csv", "oa21_lsoa21_msoa21_ltla22_rgn22.csv"],
      manifest: {tag: "lookups", files: {"oa21_lsoa21_msoa21_ltla22.csv": entry, "nspl.csv.gz": entry, "msoa_names.csv": entry, "oa21_lsoa21_msoa21_ltla22_rgn22.csv": entry}}
    }],
    // Up to date, apart from a configured file that hasn't been archived yet
    ["wd-2025", {assets: ["manifest.json", "wd25_bfc.json.gz"], manifest: {files: {"wd25_bfc.json.gz": entry}}}],
    // A geography/year that's no longer configured
    ["wd-2019", {assets: ["manifest.json", "wd19_bfc.json.gz"], manifest: {files: {"wd19_bfc.json.gz": entry}}}]
  ]);

  const plan = planPrune(configured, archived, {all: true});
  assert.deepEqual(plan.releases, ["wd-2019"]);
  assert.deepEqual(plan.assets, [{tag: "lookups", name: "oa21_lsoa21_msoa21_ltla22.csv"}]);
  assert.equal(plan.manifests.length, 1);
  assert.equal(plan.manifests[0].tag, "lookups");
  assert.deepEqual(Object.keys(plan.manifests[0].manifest.files).sort(), ["msoa_names.csv", "nspl.csv.gz", "oa21_lsoa21_msoa21_ltla22_rgn22.csv"]);

  // With a selection, releases outside it are left alone
  assert.deepEqual(planPrune(configured, archived).releases, []);

  // A manifest entry whose file is missing from the release is dropped
  const missing = new Map([["wd-2025", {assets: ["manifest.json"], manifest: {files: {"wd25_bfc.json.gz": entry}}}]]);
  assert.deepEqual(planPrune(configured, missing).manifests[0].manifest.files, {});
});
