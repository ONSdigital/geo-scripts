// Uploads local source files to the source file archive (GitHub releases, see
// config/archive.js), so that they stay available if the Geoportal retires them.
// Only new or changed files are uploaded, replacing the archived copy, and each
// release's manifest.json (checksums) is uploaded last.
//
// Needs the GitHub CLI (gh), logged in with write access to the archive repo.
import { existsSync, statSync, writeFileSync } from "fs";
import source_files from "../config/source-files.js";
import geo_config from "../config/geo-config.js";
import archive from "../config/archive.js";
import { dirs } from "../config/paths.js";
import { run, mkdir } from "./utils.js";
import { cli, selectGeos, isSelection } from "./lib/cli.js";
import { expandGeoSources } from "./lib/sources.js";
import { withRetry } from "./lib/http.js";
import { readRecord, recordedOtherSource } from "./lib/local-sources.js";
import { MANIFEST, tagFor, getManifest, sha256File, updateManifest } from "./lib/archive.js";

const usage = `Usage: npm run archive-sources -- [--geo wd] [--year 2025] [--other] [--dry-run]
  --geo, --year  only archive boundaries/centroids for these geographies and years
  --other        also archive the census and other source files (included when there's no selection)
  --dry-run      show what would be uploaded without uploading anything`;
const {opts, selected} = cli(usage, opts => selectGeos(geo_config, opts), {
  other: {type: "boolean", default: false},
  "dry-run": {type: "boolean", default: false}
});
const dryRun = opts["dry-run"];
const isSelected = (file) => selected.some(g => g.key === file.key && g.years.includes(file.year));

// Local source files, with their archive release
const files = [
  ...expandGeoSources(source_files.boundaries).filter(isSelected).map(f => ({...f, name: `${f.name}.json.gz`, path: `${dirs.boundaries}/${f.name}.json.gz`})),
  ...expandGeoSources(source_files.centroids).filter(isSelected).map(f => ({...f, name: `${f.name}.json.gz`, path: `${dirs.centroids}/${f.name}.json.gz`})),
  ...(!isSelection(opts) || opts.other ? [
    ...source_files.census.map(f => ({...f, path: `${dirs.census}/${f.name}`})),
    ...source_files.other.map(f => ({...f, path: `${dirs.other}/${f.name}`}))
  ] : [])
];

const byTag = new Map();
const record = readRecord();
for (const file of files) {
  if (!existsSync(file.path)) {
    console.log(`Skipping ${file.path}, which hasn't been downloaded`);
    continue;
  }
  // Don't archive a file under the wrong source (eg. if the config has changed since it was downloaded)
  const other = recordedOtherSource(record, file.name, file.id || file.href);
  if (other) {
    console.log(`Skipping ${file.path}, which was downloaded from ${other}, not ${file.id || file.href} - run download-files first`);
    continue;
  }
  const tag = tagFor(file);
  if (!byTag.has(tag)) byTag.set(tag, []);
  byTag.get(tag).push(file);
}

let hasGh = true;
try {
  await run("gh auth status");
} catch {
  hasGh = false;
  if (!dryRun) {
    console.error("The GitHub CLI (gh) needs to be installed and logged in (gh auth login) to upload to the archive.");
    process.exit(1);
  }
}

const repo = `-R ${archive.repo}`;

// A release's current manifest, or null if there isn't one. This goes through the GitHub
// API: the public download URL can lag behind just after an upload, and merging into an
// out-of-date manifest would drop files from it.
async function readManifest(tag) {
  try {
    return JSON.parse(await run(`gh release download "${tag}" ${repo} --pattern ${MANIFEST} --output -`));
  } catch (err) {
    if (/release not found|no assets match/i.test(err.message)) return null;
    throw err;
  }
}
// Uploads can fail on network errors, and --clobber makes a retry safe
const upload = (tag, path) => withRetry(() => run(`gh release upload "${tag}" "${path}" ${repo} --clobber`), {label: `Upload of ${path}`});
const tempDir = `${dirs.temp}/archive`;
let uploads = 0;

for (const [tag, tagFiles] of byTag) {
  // (A dry run without gh uses the public manifest, which may lag just after an upload)
  const existing = hasGh ? await readManifest(tag) : await getManifest(tag);
  const entries = {};
  const changed = [];
  for (const file of tagFiles) {
    const sha256 = await sha256File(file.path);
    const previous = existing?.files?.[file.name];
    if (previous?.sha256 === sha256) {
      entries[file.name] = previous;
    } else {
      entries[file.name] = {sha256, size: statSync(file.path).size, source: file.id || file.href, archived: new Date().toISOString()};
      changed.push(file);
    }
  }

  if (changed.length === 0) {
    console.log(`${tag}: up to date`);
    continue;
  }
  console.log(`${tag}: ${dryRun ? "would upload" : "uploading"} ${changed.map(f => `${f.name}${existing?.files?.[f.name] ? " (replacing)" : ""}`).join(", ")}`);
  if (dryRun) continue;

  // Create the release if it doesn't exist yet
  try {
    await run(`gh release view "${tag}" ${repo}`);
  } catch {
    const notes = `Source files for ${tag}, from the ONS Open Geography Portal (or as listed in ${MANIFEST}), ` +
      "archived by https://github.com/ONSdigital/geo-scripts. Files are replaced when corrected; " +
      `${MANIFEST} lists each file's source dataset and checksum.`;
    try {
      await run(`gh release create "${tag}" ${repo} --title "${tag}" --notes "${notes}"`);
    } catch (err) {
      console.error(`Couldn't create the release ${tag}: ${err.message.trim()}\n` +
        "(GitHub can't create releases in an empty repository, so the archive repo needs at least one commit.)");
      process.exit(1);
    }
  }

  // Upload the files, then the manifest last, so that the manifest only lists files that are in place
  for (const file of changed) {
    console.log(`  uploading ${file.name} (${(statSync(file.path).size / 1e6).toFixed(1)} MB)`);
    await upload(tag, file.path);
    uploads ++;
  }
  mkdir(`${tempDir}/${tag}`);
  const manifestPath = `${tempDir}/${tag}/${MANIFEST}`;
  writeFileSync(manifestPath, JSON.stringify(updateManifest(existing, tag, entries), null, 2));
  await upload(tag, manifestPath);
  console.log(`  updated ${MANIFEST}`);
}

console.log(dryRun ? "Dry run complete - nothing was uploaded." : `Uploaded ${uploads} file(s) to https://github.com/${archive.repo}/releases`);
