// This script generates a OA -> LSOA -> MSOA lookup that allows the creation of
// an OA vector map tileset where the smallest areas are merged into their parents
// at lower zooms levels, with the smallest areas merged first.
// You must run this script before make-oa-vtiles.js

import { readFileSync, writeFileSync } from "fs";
import { csvFormat } from "d3-dsv";
import { csvParse, makeLookup } from "./utils.js";
import { files } from "../config/paths.js";

const areas = csvParse(readFileSync(files.lookup, {encoding: 'utf8', flag: 'r'}));
const areas_lookup = makeLookup(areas);

const codes_raw = readFileSync(files.censusLookup, {encoding: 'utf8', flag: 'r'});
const oa_data = csvParse(
  codes_raw,
  d => ({areacd: d.oa21cd, parentcd: d.lsoa21cd, msoa: d.msoa21cd, area: areas_lookup[d.oa21cd].areakm2})
);
console.log("Loaded OA data");

const lsoa_index = {};
oa_data.forEach(d => {
  if (!lsoa_index[d.parentcd]) lsoa_index[d.parentcd] = {areacd: d.parentcd, parentcd: d.msoa, area: 0, count: 0, children: [], childarea: 0};
  lsoa_index[d.parentcd].area += d.area;
  lsoa_index[d.parentcd].count += 1;
  lsoa_index[d.parentcd].children.push(d.areacd);
  if (d.area > lsoa_index[d.parentcd].childarea) {
    lsoa_index[d.parentcd].child = d.areacd;
    lsoa_index[d.parentcd].childarea = d.area;
  }
});
const lsoa_data = Object.keys(lsoa_index).map(key => lsoa_index[key]);
console.log("Made LSOA data");

const msoa_index = {};
lsoa_data.forEach(d => {
  if (!msoa_index[d.parentcd]) msoa_index[d.parentcd] = {areacd: d.parentcd, area: 0, count: 0, children: [], childarea: 0};
  msoa_index[d.parentcd].area += d.area;
  msoa_index[d.parentcd].count += 1;
  msoa_index[d.parentcd].children = [...msoa_index[d.parentcd].children, ...d.children];
  if (d.area > msoa_index[d.parentcd].childarea) {
    msoa_index[d.parentcd].child = d.child;
    msoa_index[d.parentcd].childarea = d.area;
  }
});
const msoa_data = Object.keys(msoa_index).map(key => msoa_index[key]);
console.log("Made MSOA data");

const lsoa_msoa = [...lsoa_data, ...msoa_data].sort((a, b) => a.area - b.area);

const drop_rate = 2;
const count = oa_data.length;
const targets = [count];

while (targets[targets.length - 1] > msoa_data.length) {
  const new_target = Math.floor(targets[targets.length - 1] / drop_rate);
  targets.push(new_target > msoa_data.length ? new_target : msoa_data.length);
}
console.log("Target feature counts", targets);

const merges = [];

for (let i = 0; i < targets.length - 1; i ++) {
  let merge = [];
  let count = targets[i];
  while (count > targets[i + 1]) {
    if (!lsoa_msoa[0]) break;
    count = count + 1 - lsoa_msoa[0].count;
    merge = [...merge, lsoa_msoa.shift()];
  }
  merges.push(merge);
}

console.log("Generating code merge lookup by zoom level...");
const oa_index = {};
let cols = ["areacd"];

oa_data.forEach(oa => {
  const row = {areacd: oa.areacd};
  for (let i = 0; i < merges.length; i ++) {
    row[`areacd${i}`] = oa.areacd;
  }
  oa_index[oa.areacd] = row;
});
for (let i = 0; i < merges.length; i ++) {
  const merge = merges[i];
  for (const m of merge) {
    for (const c of m.children) {
      for (let j = i; j < merges.length; j ++) {
        oa_index[c][`areacd${j}`] = m.child;
        oa_index[c][`parentcd${j}`] = m.areacd;
      }
    }
  }
  cols = [...cols, `areacd${i}`, `parentcd${i}`];
  console.log(i, (new Set(Object.keys(oa_index).map(key => oa_index[key][`areacd${i}`]))).size);
}
const oa_lookup = Object.keys(oa_index).map(key => oa_index[key]);

const oa_path = files.vtilesLookup("oa");
writeFileSync(oa_path, csvFormat(oa_lookup, cols));
console.log(`Wrote ${oa_path}`);

const msoa_path = files.vtilesLookup("msoa");
writeFileSync(msoa_path, csvFormat(msoa_data.map(d => ({areacd: d.areacd, childcd: d.child}))));
console.log(`Wrote ${msoa_path}`);