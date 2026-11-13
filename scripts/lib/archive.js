// Helpers for the source file archive (GitHub release assets, see config/archive.js)
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { fetchJSON, HttpError } from "./http.js";
import archive from "../../config/archive.js";

export const MANIFEST = "manifest.json";

// The release a source file belongs to, eg. {key: "wd", year: 2025} -> "wd-2025"
export const tagFor = (file) => file.key && file.year ? `${file.key}-${file.year}` : archive.lookupsTag;

export const assetUrl = (tag, name, repo = archive.repo) =>
  `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;

export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", chunk => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

// A release's manifest ({files: {name: {sha256, size, ...}}}), or null if the release
// or its manifest doesn't exist. Cached per tag.
const manifests = new Map();
export function getManifest(tag) {
  if (!manifests.has(tag)) {
    manifests.set(tag, fetchJSON(assetUrl(tag, MANIFEST), {retries: 2})
      .catch(err => {
        if (err instanceof HttpError && err.status === 404) return null;
        manifests.delete(tag);
        throw err;
      }));
  }
  return manifests.get(tag);
}

// Merge new file entries into a release's manifest
export function updateManifest(existing, tag, entries) {
  return {
    tag,
    repo: archive.repo,
    updated: new Date().toISOString(),
    files: {...(existing?.files || {}), ...entries}
  };
}

// The manifest entry for a local file, given its archived entry (previous, or undefined),
// and whether the file needs uploading (upload) or just its manifest entry updating
// (changed). A file whose dataset has changed but whose contents haven't (eg. a new
// Geoportal version with the same boundaries) keeps its archived copy, but the entry
// takes the new source, as download-files only uses archived files from the configured source.
export function planEntry(previous, {sha256, size, source}, now = new Date().toISOString()) {
  if (previous?.sha256 === sha256) {
    if (previous.source === source) return {entry: previous, upload: false, changed: false};
    return {entry: {...previous, source}, upload: false, changed: true};
  }
  return {entry: {sha256, size, source, archived: now}, upload: true, changed: true};
}

// What to remove so that the archive holds only the files the config names. configured
// maps each tag in scope to the names of its configured files, and archived maps each
// release to {assets: [names], manifest}. Releases outside configured are left alone,
// unless the whole archive is in scope (all), when they're removed. Returns
// {releases: [tags], assets: [{tag, name}], manifests: [{tag, manifest}]}, where the
// manifests have entries only for configured files that are in the release.
export function planPrune(configured, archived, {all = false} = {}) {
  const plan = {releases: [], assets: [], manifests: []};
  for (const [tag, {assets, manifest}] of archived) {
    const names = configured.get(tag);
    if (!names) {
      if (all) plan.releases.push(tag);
      continue;
    }
    const kept = new Set();
    for (const name of assets) {
      if (name === MANIFEST) continue;
      if (names.has(name)) kept.add(name);
      else plan.assets.push({tag, name});
    }
    const entries = Object.entries(manifest?.files || {});
    if (entries.some(([name]) => !kept.has(name))) {
      const files = Object.fromEntries(entries.filter(([name]) => kept.has(name)));
      plan.manifests.push({tag, manifest: {...manifest, updated: new Date().toISOString(), files}});
    }
  }
  return plan;
}
