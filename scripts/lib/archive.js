// Helpers for the source file archive (GitHub release assets, see config/archive.js)
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { fetchJSON, HttpError } from "./http.js";
import archive from "../../config/archive.js";

export const MANIFEST = "manifest.json";

// The release a source file belongs to, eg. {key: "wd", year: 2025} -> "wd-2025"
export const tagFor = (file) => file.key && file.year ? `${file.key}-${file.year}` : archive.otherTag;

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
