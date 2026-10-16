// A record of which dataset each downloaded source file came from (input/sources.json).
// Local files keep the same name when config/source-files.js points them at a different
// dataset, so this is how download-files knows to replace them, and how archive-sources
// avoids archiving a file under the wrong source. Files downloaded before the record
// existed have no entry, and are assumed to match the config.
import { existsSync, readFileSync, writeFileSync, renameSync } from "fs";
import { files } from "../../config/paths.js";

export function readRecord(path = files.sourceRecord) {
  return existsSync(path) ? JSON.parse(readFileSync(path, {encoding: "utf8"})) : {};
}

export function recordDownload(name, source, from, path = files.sourceRecord) {
  const record = readRecord(path);
  record[name] = {source, from, downloaded: new Date().toISOString()};
  writeFileSync(`${path}.part`, JSON.stringify(record, null, 2));
  renameSync(`${path}.part`, path);
}

// The dataset a local file is recorded as coming from, if it isn't the expected one
export function recordedOtherSource(record, name, source) {
  const recorded = record[name]?.source;
  return recorded && recorded !== source ? recorded : null;
}
