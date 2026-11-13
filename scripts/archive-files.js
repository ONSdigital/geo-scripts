// Uploads local source files to the source file archive (GitHub releases, see
// config/archive.js), so that they stay available if the Geoportal retires them.
// Only new or changed files are uploaded, replacing the archived copy, and each
// release's manifest.json (checksums) is uploaded last. With --prune, files and releases
// the config no longer names are then removed, so the archive matches the config.
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
import { readRecord, recordedOtherSource, sourceOf } from "./lib/local-sources.js";
import { MANIFEST, tagFor, getManifest, sha256File, updateManifest, planEntry, planPrune } from "./lib/archive.js";

const usage = `Usage: npm run archive-files -- [--geo wd] [--year 2025] [--lookups] [--prune] [--dry-run]
  --geo, --year  only archive boundaries/centroids for these geographies and years
  --lookups      also archive the lookups (census lookup, NSPL, MSOA names), which are
                 included when there's no selection. Changed files replace the archived ones.
  --prune        then remove files that config/source-files.js doesn't name from the selected
                 releases (eg. after a file is renamed), and without a selection, remove
                 releases for geographies/years that are no longer configured
  --dry-run      show what would be uploaded (and removed) without changing anything`;
const {opts, selected} = cli(usage, opts => selectGeos(geo_config, opts), {
  lookups: {type: "boolean", default: false},
  prune: {type: "boolean", default: false},
  "dry-run": {type: "boolean", default: false}
});
const dryRun = opts["dry-run"];
const isSelected = (file) => selected.some(g => g.key === file.key && g.years.includes(file.year));

// Every configured source file, and the selected ones
const lookups = source_files.lookups.map(f => ({...f, path: `${dirs.sources}/${f.name}`}));
const configured = [
  ...expandGeoSources(source_files.boundaries).map(f => ({...f, name: `${f.name}.json.gz`, path: `${dirs.boundaries}/${f.name}.json.gz`})),
  ...expandGeoSources(source_files.centroids).map(f => ({...f, name: `${f.name}.json.gz`, path: `${dirs.centroids}/${f.name}.json.gz`})),
  ...lookups
];
const files = [
  ...configured.filter(f => f.key && f.year && isSelected(f)),
  ...(!isSelection(opts) || opts.lookups ? lookups : [])
];

const byTag = new Map();
const record = readRecord();
for (const file of files) {
  if (!existsSync(file.path)) {
    console.log(`Skipping ${file.path}, which hasn't been downloaded`);
    continue;
  }
  // Don't archive a file under the wrong source (eg. if the config has changed since it was downloaded)
  const other = recordedOtherSource(record, file.name, sourceOf(file));
  if (other) {
    console.log(`Skipping ${file.path}, which was downloaded from ${other}, not ${sourceOf(file)} - run download-files first`);
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
  if (!dryRun || opts.prune) {
    console.error("The GitHub CLI (gh) needs to be installed and logged in (gh auth login) to upload to the archive.");
    process.exit(1);
  }
}

const repo = `-R ${archive.repo}`;

// Run a gh command, retrying network errors (but not a missing release or asset)
const gh = (args, label) => withRetry(() => run(`gh ${args} ${repo}`).catch(err => {
  if (/release not found|no assets match/i.test(err.message)) err.retryable = false;
  throw err;
}), {label});

// A release's current manifest, or null if there isn't one. This goes through the GitHub
// API: the public download URL can lag behind just after an upload, and merging into an
// out-of-date manifest would drop files from it.
async function readManifest(tag) {
  try {
    return JSON.parse(await gh(`release download "${tag}" --pattern ${MANIFEST} --output -`, `Reading ${tag}/${MANIFEST}`));
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
  const resourced = [];
  for (const file of tagFiles) {
    const previous = existing?.files?.[file.name];
    const plan = planEntry(previous, {sha256: await sha256File(file.path), size: statSync(file.path).size, source: sourceOf(file)});
    entries[file.name] = plan.entry;
    if (plan.upload) changed.push(file);
    else if (plan.changed) resourced.push({file, from: previous.source});
  }

  if (changed.length === 0 && resourced.length === 0) {
    console.log(`${tag}: up to date`);
    continue;
  }
  if (changed.length) console.log(`${tag}: ${dryRun ? "would upload" : "uploading"} ${changed.map(f => `${f.name}${existing?.files?.[f.name] ? " (replacing)" : ""}`).join(", ")}`);
  for (const {file, from} of resourced) {
    console.log(`${tag}: ${file.name} is unchanged, but ${dryRun ? "would be" : "is being"} recorded as from ${sourceOf(file)} (was ${from || "not recorded"})`);
  }
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

// Remove what the config no longer names: from the selected releases, or from the whole
// archive when there's no selection
if (opts.prune) {
  const all = !isSelection(opts);
  const names = new Map();
  for (const file of configured) {
    const tag = tagFor(file);
    if (!names.has(tag)) names.set(tag, new Set());
    names.get(tag).add(file.name);
  }
  const scope = all ? names : new Map([...new Set(files.map(tagFor))].map(tag => [tag, names.get(tag)]));
  const tags = all ?
    JSON.parse(await gh("release list --limit 1000 --json tagName", "Listing releases")).map(r => r.tagName) :
    [...scope.keys()];

  const archived = new Map();
  for (const tag of tags) {
    let assets;
    try {
      assets = JSON.parse(await gh(`release view "${tag}" --json assets`, `Listing ${tag}`)).assets.map(a => a.name);
    } catch (err) {
      if (/release not found/i.test(err.message)) continue;
      throw err;
    }
    archived.set(tag, {assets, manifest: await readManifest(tag)});
  }

  const plan = planPrune(scope, archived, {all});
  const verb = dryRun ? "Would remove" : "Removing";
  if (!plan.releases.length && !plan.assets.length && !plan.manifests.length) console.log("Nothing to prune: the archive matches the config.");
  for (const {tag, name} of plan.assets) console.log(`${verb} ${tag}/${name}`);
  for (const {tag, manifest} of plan.manifests) console.log(`${dryRun ? "Would update" : "Updating"} ${tag}/${MANIFEST} (${Object.keys(manifest.files).length} file(s))`);
  for (const tag of plan.releases) console.log(`${verb} the release ${tag} and its tag (not in the config)`);

  if (!dryRun) {
    // Manifests first, so that they never list a file that has been removed
    for (const {tag, manifest} of plan.manifests) {
      mkdir(`${tempDir}/${tag}`);
      const manifestPath = `${tempDir}/${tag}/${MANIFEST}`;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      await upload(tag, manifestPath);
    }
    for (const {tag, name} of plan.assets) {
      await gh(`release delete-asset "${tag}" "${name}" --yes`, `Removal of ${tag}/${name}`);
    }
    for (const tag of plan.releases) {
      await gh(`release delete "${tag}" --cleanup-tag --yes`, `Removal of ${tag}`);
    }
    console.log(`Removed ${plan.assets.length} file(s) and ${plan.releases.length} release(s).`);
  } else {
    console.log("Dry run - nothing was removed.");
  }
}
