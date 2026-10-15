import { readdirSync } from "fs";
import LineByLineReader from "line-by-line";
import { unzip, clearTemp, writeGzip, mkdir } from "./utils.js";
import { dirs, files } from "../config/paths.js";

const zip_path = files.nspl;
const temp_dir = "./temp";
const data_dir = `${temp_dir}/Data`
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

await clearTemp();

console.log(`Unzipping ${zip_path}`);
await unzip(zip_path, temp_dir);

console.log(`Creating output directory ${out_dir}`);
mkdir(out_dir);

const in_file = readdirSync(data_dir).find(file => file.slice(-4) === ".csv");
const in_path = `${data_dir}/${in_file}`;

let fileCols;
let lines = 0;

const chunks = {};

const lr = new LineByLineReader(in_path);

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
      const cd = index.pcds.replaceAll(" ", "");
      const prefixes = [cd.slice(0, 1), cd.slice(0, 2), cd.slice(0, 3), cd.slice(0, 4)];
      for (const prefix of prefixes) {
        if (!chunks[prefix]) {
          chunks[prefix] = {};
          for (const col of cols) chunks[prefix][col.target] = [];
        }
        if (prefix.length > 3 || chunks[prefix][cols[0].target].length < 10) {
          for (const col of cols) chunks[prefix][col.target].push(
            col.type === "number" ? +index[col.source] : index[col.source]
          );
        }
      }
    }
  }
  lines += 1;
  if (lines % 1000 === 0) console.log(`${lines.toLocaleString()} lines processed...`)
});

lr.on('end', function () {
  for (const prefix in chunks) {
    const path = `${out_dir}/${prefix}.json`;
    writeGzip(path, JSON.stringify(chunks[prefix]));
    console.log(`Wrote ${path}`);
  }
  clearTemp();
});

lr.on('error', function (err) {
	console.log(err);
});