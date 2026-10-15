import { readdirSync, existsSync } from "fs";
import { run, gzipInPlace } from "./utils.js";
import { dirs } from "../config/paths.js";

const dir = dirs.vtiles;

const files = readdirSync(dir);

for (const file of files.filter(f => f.split(".")[1] === "mbtiles")) {
  const path = `${dir}/${file.split(".")[0]}`;
  if (!existsSync(`${path}.zip`)) {
    await run(`tile-join -e ${path} -pk ${dir}/${file}`);
    // The .pbf tiles are already gzipped. Gzip metadata.json too (keeping its name),
    // so every file in the tileset can be served with Content-Encoding: gzip.
    const metadata = `${path}/metadata.json`;
    if (existsSync(metadata) && gzipInPlace(metadata)) console.log(`Gzipped ${metadata}`);
    await run(`zip -r ${path}.zip -m ${path}/*`);
    await run(`rmdir ${path}`);
    console.log(`Zipped ${path}.zip`);
  } else {
    console.log(`Already zipped ${dir}/${file}`);
  }
}
