// Helpers for the grouped source manifest in config/source-files.js
import { yy } from "../../config/paths.js";

// Expand {key, year, code, ids: {detail: id}} entries into one file per detail level
export function expandGeoSources(entries = []) {
  return entries.flatMap(({key, year, code, ids}) =>
    Object.entries(ids).map(([detail, id]) => ({name: `${key}${yy(year)}_${detail}`, key, year, detail, id, code}))
  );
}
