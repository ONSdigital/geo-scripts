import { test } from "node:test";
import assert from "node:assert/strict";
import geo_config from "../config/geo-config.js";
import { groupChildren, authorityGroup } from "../scripts/lib/children.js";

const area = (areacd, areanm, extra = {}) => ({areacd, areanm, ...extra});
const summary = (groups) => groups.map(g => `${g.key} "${g.label}": ${g.areas.map(a => a.areacd).join(" ")}`);

test("a region's combined authorities and unitaries are one group, then constituencies and other types", () => {
  // Children of the North West, in the order they come from the lookup
  const children = [
    area("E06000049", "Cheshire East"), area("E06000007", "Warrington"),
    area("E14001065", "Altrincham and Sale West"), area("E30000239", "Manchester"),
    area("E47000001", "Greater Manchester"), area("E47000004", "Liverpool City Region"),
    area("K01000009", "Carlisle")
  ];
  assert.deepEqual(summary(groupChildren(children, geo_config)), [
    'cauth "Upper tier/combined authority": E06000049 E47000001 E47000004 E06000007',
    'wpc "Parliamentary constituency": E14001065',
    'ttwa "Travel to work area": K01000009 E30000239'
  ]);
});

test("authority groups are named by what they contain, as in Explore Local Statistics", () => {
  assert.deepEqual(authorityGroup(["E47"]), {key: "cauth", label: "Combined authority"});
  assert.deepEqual(authorityGroup(["E47", "E06", "E10"]), {key: "cauth", label: "Upper tier/combined authority"});
  // eg. the East Midlands combined authority: counties and unitaries
  assert.deepEqual(authorityGroup(["E10", "E06"]), {key: "utla", label: "Upper tier/unitary authority"});
  assert.deepEqual(authorityGroup(["E10"]), {key: "cty", label: "County"});
  // eg. Hertfordshire (districts), Greater Manchester (metropolitan districts), Wales (unitaries)
  for (const types of [["E07"], ["E08"], ["W06"], ["S12"], ["N09"], ["E09"]]) {
    assert.deepEqual(authorityGroup(types), {key: "ltla", label: "Lower tier/unitary authority"});
  }
});

test("an authority's wards, parishes and MSOAs are grouped and sorted by name", () => {
  const children = [
    area("E02000003", "Hartlepool 003", {hclnm: "Seaton"}), area("E05000001", "Rural West"),
    area("E04000001", "Elwick"), area("E02000001", "Hartlepool 001", {hclnm: "Headland"}),
    area("E05000002", "De Bruce"), area("E63000001", "Hartlepool")
  ];
  assert.deepEqual(summary(groupChildren(children, geo_config)), [
    'wd "Electoral ward": E05000002 E05000001',
    'par "Parish": E04000001',
    'bua "Built-up area": E63000001',
    'msoa "Middle-layer super output area": E02000001 E02000003'
  ]);
});

test("each child appears exactly once", () => {
  const children = [
    area("E92000001", "England"), area("W92000004", "Wales"), area("E12000001", "North East"),
    area("E47000001", "Greater Manchester"), area("E10000015", "Hertfordshire"), area("E06000001", "Hartlepool"),
    area("E07000095", "Broxbourne"), area("E14001065", "Altrincham"), area("W09000048", "Senedd 1"), area("XYZ000001", "Unknown")
  ];
  const groups = groupChildren(children, geo_config);
  const codes = groups.flatMap(g => g.areas.map(a => a.areacd));
  assert.deepEqual([...codes].sort(), children.map(c => c.areacd).sort());
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(groupChildren([], geo_config), []);
});
