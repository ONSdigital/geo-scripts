import { existsSync, readFileSync, writeFileSync, createReadStream } from "fs";
import zlib from "zlib";
import readline from "line-by-line";
import { booleanPointInPolygon, intersect, area, booleanContains, booleanIntersects } from "@turf/turf";
import { csvFormat } from "d3-dsv";
import { csvParse, getValidBoundariesPath } from "./utils.js";
import { bboxIndex } from "./lib/spatial.js";
import geo_config from "../config/geo-config.js";
import { files } from "../config/paths.js";
import { cli, rejectSelection } from "./lib/cli.js";

const {opts} = cli("Usage: npm run get-relations");
rejectSelection(opts, "the master lookup needs every geography and year in config/geo-config.js");

const startTime = new Date();

const data_path = files.metadata;
const outpath = files.lookup;

const cols = [
  "areacd", "areanm", "areanmw",
  "hclnm", "hclnmw",
  "parentcd", "successorcd",
  "start", "end",
  "areakm2", "centroid", "bounds"
];

// Check if a centroid fits in a parent bbox
function isParent(parent, child) {
  return child.centroid[0] > parent.bounds[0] &&
    child.centroid[0] < parent.bounds[2] &&
    child.centroid[1] > parent.bounds[1] &&
    child.centroid[1] < parent.bounds[3];
}

function isMatchingYear(parent, child) {
  return (!parent.start && !parent.end) ||
    (!child.end && !parent.end) ||
    (child.end && (
      (!parent.end || parent.end >= child.end) &&
      (!parent.start || parent.start <= child.end)
    ));
}

function isNextYear(newer, older) {
  return older.end && newer.start && older.end === newer.start - 1;
}

function getChildren(geo, yr, data_indexed, parents, poss_children) {
  const input = getValidBoundariesPath(geo.key, yr);  

  return new Promise((resolve) => {
    console.log(`Finding matches in ${input}`);

    const lineReader = new readline(createReadStream(input).pipe(zlib.createGunzip()));

    let i = 0;

    lineReader.on('line', (line) => {
      lineReader.pause();
      const feature = JSON.parse(line);
      const cd = feature.properties.areacd;
      const poss_c = poss_children[cd];
      if (poss_c) {
        for (const c of poss_c) {
          const obj = data_indexed[c];
          if (!parents[c] && booleanPointInPolygon(
            {type: "Point", coordinates: obj.centroid},
            feature
          )) {
            parents[c] = cd;
          }
        }
      }
      i ++;
      if (i % 1000 === 0) console.log(`Checked ${i.toLocaleString()} polygons...`);
      lineReader.resume();
    });

    lineReader.on("end", async () => {
      console.log(`Checked ${i.toLocaleString()} polygons...`);
      resolve();
    });
  });
}

function getFeatureFromFile(cd, path) {
  console.log(`Attempting to get ${cd} from ${path}...`);

  return new Promise((resolve) => {
    const lineReader = new readline(createReadStream(path).pipe(zlib.createGunzip()));

    let feature;

    lineReader.on('line', (line) => {
      if (!feature) {
        lineReader.pause();
        const ft = JSON.parse(line);
        if (ft?.properties?.areacd === cd) {
          console.log(`Found feature!`);
          feature = ft;
        }
        lineReader.resume();
      }
    });

    lineReader.on("end", async () => {
      resolve(feature);
    });
  });
}

async function getParentByPolygon(data_indexed, childcd, parentcds) {
  console.log(`Getting match for ${childcd} by polygon intersection...`);
  const child_geo = geo_config.find(g => g.codes.includes(childcd.slice(0, 3)));
  const parent_geos = parentcds.map(p => geo_config.find(g => g.codes.includes(p.slice(0, 3))));

  const child_data = data_indexed[childcd];
  const year = !child_data.end ?
    child_geo.years[child_geo.years.length - 1] :
    child_geo.years[child_geo.years.indexOf(child_data.end + 1) - 1];
  const path = getValidBoundariesPath(child_geo.key, `${year}`.slice(-2));
  const child = await getFeatureFromFile(childcd, path);

  // Looks for the possible parent that has the biggest intersection with the child
  let best_parent;
  for (let i = 0; i < parentcds.length; i ++) {
    const geo = parent_geos[i];
    const cd = parentcds[i];
    const data = data_indexed[cd];
    const year = !data.end ?
      geo.years[geo.years.length - 1] :
      geo.years[geo.years.indexOf(data.end + 1) - 1];
    const path = getValidBoundariesPath(geo.key, `${year}`.slice(-2));
    const parent = await getFeatureFromFile(cd, path);
    const intersection = intersect(child, parent);
    const overlap = intersection ? area(intersection) : null;
    if (overlap && (!best_parent || overlap > best_parent.overlap)) {
      best_parent = {cd, overlap};
    }
  }
  console.log(`Best match for ${childcd} is ${best_parent?.cd}!`)
  return best_parent?.cd;
}

const lookup = {};

for (const geo of geo_config) {
  for (const cd of geo.codes) {
    lookup[cd] = {key: geo.key};
    lookup[cd].parents = geo.parents.filter(p => cd[0] === "K" ? true : [cd[0], "K"].includes(p[0]));
    lookup[cd].siblings = geo.codes.filter(c => c[0] === cd[0]);
  }
}

const data_raw = readFileSync(data_path, {encoding: 'utf8', flag: 'r'});
const data = csvParse(data_raw)
  .map(d => ({
    ...d,
    centroid: d.centroid.split("|").map(coord => +coord),
    bounds: d.bounds.split("|").map(coord => +coord)
  }));

const data_indexed = {};
const data_grouped = {};

for (const d of data) {
  const grp = d.areacd.slice(0, 3);
  if (!data_grouped[grp]) data_grouped[grp] = [];
  data_grouped[grp].push(d);
  data_indexed[d.areacd] = d;
}

// Grid indexes of each group's bboxes, so each area is only compared with nearby
// candidate parents/successors (in their original order, which breaks ties later)
const group_indexes = {};
function groupIndex(cd) {
  if (!group_indexes[cd]) {
    const bounds = (data_grouped[cd] || []).map(d => d.bounds);
    const sizes = bounds.map(b => Math.max(b[2] - b[0], b[3] - b[1])).sort((a, b) => a - b);
    const cellSize = Math.min(Math.max(sizes[Math.floor(sizes.length / 2)] || 1, 0.01), 1);
    group_indexes[cd] = bboxIndex(bounds, cellSize);
  }
  return group_indexes[cd];
}
const candidates = (cd, d) => groupIndex(cd).queryPoint(d.centroid).map(i => data_grouped[cd][i]);

const parents = {};
const poss_children = {};
const poss_parents = {};
const parent_grps = [];

let i = 0;
console.log("Finding possible parents by bbox...")
for (const d of data) {
  const grp = d.areacd.slice(0, 3);
  let p_parents = [];
  for (const cd of lookup[grp].parents) {
    if (!parent_grps.includes(cd)) parent_grps.push(cd);
    p_parents = [
      ...p_parents,
      ...candidates(cd, d).filter(p => isParent(p, d) && isMatchingYear(p, d)).map(p => p.areacd)
    ];
  }
  if (p_parents.length === 1) {
    parents[d.areacd] = p_parents[0];
  } else if (p_parents.length > 1) {
    for (const p of p_parents) {
      if (!poss_children[p]) poss_children[p] = [];
      poss_children[p].push(d.areacd);
    }
    poss_parents[d.areacd] = p_parents;
  } else if (lookup[grp].parents.length > 0) {
    // (Top-level geographies, eg. the UK, have no parents to find)
    console.log(`No possible parents found for ${d.areanm} (${d.areacd})!`);
  }
  i ++;
  if (i % 1000 === 0) console.log(`Tested bboxes for ${i.toLocaleString()} areas...`);
}

const successors = {};
const poss_superceded = {};
const poss_successors = {};
const successor_grps = [];

i = 0;
console.log("Finding possible successors by bbox...")
for (const d of data) {
  if (d.end) {
    const grp = d.areacd.slice(0, 3);
    if (!successor_grps.includes(grp)) successor_grps.push(grp);
    let p_successors = [];
    for (const cd of lookup[grp].siblings) {
      p_successors = [
        ...p_successors,
        ...candidates(cd, d).filter(s => isNextYear(s, d) && isParent(s, d)).map(s => s.areacd)
      ];
    }
    if (p_successors.length === 1) {
      successors[d.areacd] = p_successors[0];
    } else if (p_successors.length > 1) {
      for (const s of p_successors) {
        if (!poss_superceded[s]) poss_superceded[s] = [];
        poss_superceded[s].push(d.areacd);
      }
      poss_successors[d.areacd] = p_successors;
    } else {
      console.log(`No possible successors found for ${d.areanm} (${d.areacd})!`);
    }
    i ++;
    if (i % 100 === 0) {
      console.log(`Tested bboxes for ${i.toLocaleString()} superceded areas...`);
    }
  }
}

const parent_geos = geo_config.filter(g => g.codes.some(cd => parent_grps.includes(cd)));

console.log("Finding actual parents by point in polygon...");
for (const geo of [...parent_geos].reverse()) {
  for (const year of geo.years) {
    const yr =  `${year}`.slice(-2);
    await getChildren(geo, yr, data_indexed, parents, poss_children);
  }
}

const successor_geos = geo_config.filter(g => g.codes.some(cd => successor_grps.includes(cd)));

console.log("Finding actual successors by point in polygon...");
for (const geo of successor_geos) {
  for (const year of geo.years.slice(1)) {
    const yr = `${year}`.slice(-2);
    await getChildren(geo, yr, data_indexed, successors, poss_superceded);
  }
}

console.log("Adding parents and successors to lookup...");
for (const d of data) {
  d.centroid = d.centroid.join("|");
  d.bounds = d.bounds.join("|");
  if (parents[d.areacd]) {
    d.parentcd = parents[d.areacd];
  } else {
    d.parentcd = poss_parents?.[d.areacd]?.[0] ?
    await getParentByPolygon(data_indexed, d.areacd, poss_parents[d.areacd]) :
    "";
  }
  if (successors[d.areacd]) {
    d.successorcd = successors[d.areacd];
  } else {
    d.successorcd = poss_successors?.[d.areacd]?.[0] ?
    await getParentByPolygon(data_indexed, d.areacd, poss_successors[d.areacd]) :
    "";
  }
}

writeFileSync(outpath, csvFormat(data, cols));
console.log(`Wrote ${outpath}`);

const endTime = new Date();
const duration = Math.round((endTime - startTime) / 1000);
console.log(`Script completed in ${duration.toLocaleString()} seconds.`);
