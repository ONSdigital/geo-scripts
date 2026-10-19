import { createReadStream } from "fs";
import zlib from "zlib";
import LineByLineReader from "line-by-line";
import { writeGzip, mkdir } from "./utils.js";
import { dirs, files } from "../config/paths.js";

// The NSPL, as a gzipped CSV of every postcode (see config/source-files.js)
const in_path = files.nspl;
const out_dir = dirs.postcodes;

const cols = [
  {source: "pcds", target: "cd", type: "string"},
  {source: "lat", target: "lat", type: "number"},
  {source: "long", target: "lng", type: "number"}
];

function getCols(row) {
  const cols = row.split(",").map(col => col.replace(/[0-9]/g, ''));
  return cols;
}

console.log(`Creating output directory ${out_dir}`);
mkdir(out_dir);
console.log(`Reading ${in_path}`);

// Postcodes are listed in standard 7-character order (outward code padded to 4
// characters, eg. "PO1 4AA" before "PO141AA"), whatever order the NSPL rows are in
const sortKey = (pcds) => {
  const [outward, inward = ""] = pcds.split(" ");
  return outward.padEnd(4, " ") + inward;
};
const byKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

let fileCols;
let lines = 0;

// Postcodes by prefix. Prefixes of 1-3 characters keep just the first 10 postcodes;
// 4-character prefixes keep them all.
const chunks = {};

const lr = new LineByLineReader(createReadStream(in_path).pipe(zlib.createGunzip()));

lr.on('line', function (line) {
	if (lines === 0) {
    fileCols = getCols(line);
  } else {
    const arr = line.split(",").map(str => str.replaceAll('"', ""));
    const index = {};
    for (let i = 0; i < fileCols.length; i ++) {
      index[fileCols[i]] = arr[i];
    }
    if (index.lat) {
      const row = {key: sortKey(index.pcds)};
      for (const col of cols) row[col.target] = col.type === "number" ? +index[col.source] : index[col.source];
      const cd = index.pcds.replaceAll(" ", "");
      const prefixes = [cd.slice(0, 1), cd.slice(0, 2), cd.slice(0, 3), cd.slice(0, 4)];
      for (const prefix of prefixes) {
        const chunk = chunks[prefix] ||= [];
        if (prefix.length > 3) chunk.push(row);
        else if (chunk.length < 10 || row.key < chunk[chunk.length - 1].key) {
          // Keep the 10 first postcodes in order
          chunk.push(row);
          chunk.sort(byKey);
          if (chunk.length > 10) chunk.pop();
        }
      }
    }
  }
  lines += 1;
  if (lines % 100000 === 0) console.log(`${lines.toLocaleString()} lines processed...`)
});

lr.on('end', function () {
  for (const prefix in chunks) {
    const rows = chunks[prefix].sort(byKey);
    const json = {};
    for (const col of cols) json[col.target] = rows.map(r => r[col.target]);
    const path = `${out_dir}/${prefix}.json`;
    writeGzip(path, JSON.stringify(json));
    console.log(`Wrote ${path}`);
  }
});

lr.on('error', function (err) {
	console.log(err);
});
