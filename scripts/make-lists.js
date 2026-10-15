import { readFileSync, writeFileSync } from "fs";
import { csvFormat } from "d3-dsv";
import { csvParse, mkdir } from "./utils.js";
import geos from "../config/geo-config.js";
import { dirs, files } from "../config/paths.js";
import { cli, selectGeos } from "./lib/cli.js";

const usage = `Usage: npm run make-lists -- [--geo ltla,wd] [--year 2025]
  --geo, --year  only write the per-type lists for these geographies/years (the combined place lists are always written)`;
const {selected} = cli(usage, opts => selectGeos(geos, opts));

// Make lists for ELS and BaCAP
const filter = {cp: ["E", "W"]};
const extra = {cp: [{areacd: "K04000001", areanm: "England and Wales"}]};
const lists = Array.from(new Set(geos.map(g => g.list).flat().filter(l => l)));

const inpath = files.lookup;
const data = csvParse(readFileSync(inpath, {encoding: 'utf8', flag: 'r'}));

const outdir = dirs.lists;
mkdir(outdir);

const typecds = {};
for (const geo of geos) typecds[geo.key] = geo.codes;

for (const list of lists) {
  const include = {};
  for (const g of geos) {
    for (const c of g.codes) {
      if (g?.list?.includes(list) && (!filter[list] || filter[list].includes(c[0]))) include[c] = g;
    }
  }

  const rows =  extra[list] || [];
  for (const d of data) {
    const incl = include[d.areacd.slice(0, 3)];
    if (incl && !d.end) {
      const row = {areacd: d.areacd, areanm: d.hclnm || d.areanm};
      if (incl.listparents) row.parentcd = d.parentcd;
      rows.push(row);
    }
  }
  
  const path = `${outdir}/${list}_places.csv`;
  writeFileSync(path, csvFormat(rows));
  console.log(`Wrote ${path}`);
}

// Make name/code lists for all area types
const columns = ["areacd", "areanm"];

for (const geo of selected.filter(g => g.key !== "uk")) {
  for (const year of geo.years) {
    const codes = typecds[geo.key];
    const rows = data.filter(d =>
      codes.includes(d.areacd.slice(0, 3)) &&
      (d.start || year) <= year &&
      (d.end || year) >= year
    );

    const path = `${outdir}/${geo.key}${`${year}`.slice(-2)}.csv`;
    writeFileSync(path, csvFormat(rows, rows.length ? columns.filter(c => rows[0][c]) : columns));
    console.log(`Wrote ${path}`);
  }
}