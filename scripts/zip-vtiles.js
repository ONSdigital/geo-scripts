import { readdirSync, existsSync } from "fs";
import { run } from "./utils.js";
import { dirs } from "../config/paths.js";

const dir = dirs.vtiles;

const files = readdirSync(dir);

for (const file of files.filter(f => f.split(".")[1] === "mbtiles")) {
  const path = `${dir}/${file.split(".")[0]}`;
  if (!existsSync(`${path}.zip`)) {
    await run(`tile-join -e ${path} -pk ${dir}/${file}`);
    await run(`zip -r ${path}.zip -m ${path}/*`);
    await run(`rmdir ${path}`);
    console.log(`Zipped ${path}.zip`);
  } else {
    console.log(`Already zipped ${dir}/${file}`);
  }
}