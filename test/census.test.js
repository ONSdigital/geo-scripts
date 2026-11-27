import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCensusLookup, compressCensusCodes } from "../scripts/lib/census.js";

// A small hierarchy: 2 LTLAs > 2 MSOAs each > 2 LSOAs each > 3 OAs each
const data = [];
for (let la = 1; la <= 2; la ++) {
  for (let ms = 1; ms <= 2; ms ++) {
    for (let ls = 1; ls <= 2; ls ++) {
      for (let oa = 1; oa <= 3; oa ++) {
        data.push({
          oa21cd: `OA${la}${ms}${ls}${oa}`,
          lsoa21cd: `LSOA${la}${ms}${ls}`,
          msoa21cd: `MSOA${la}${ms}`,
          ltla22cd: `LA${la}`
        });
      }
    }
  }
}
const lkp = makeCensusLookup(data);
const oas = (prefix) => data.filter(d => d.oa21cd.startsWith(`OA${prefix}`)).map(d => d.oa21cd);

// The original implementation from get-best-fits.js, kept as a reference
function reference(oacds, c_lkp, type) {
  let rows = oacds.map(cd => c_lkp.lookup[cd]);
  const typecd = `${type}21cd`;
  const types = ["oa21cd", "lsoa21cd", "msoa21cd", "ltla22cd"];
  const codes = [];
  while (rows.length > 0) {
    const row = rows[0];
    let found = false;
    for (const key of types.slice(types.indexOf(typecd) + 1).reverse()) {
      if (!codes.includes(row[key]) && rows.filter(d => d[key] === row[key]).length === c_lkp.counts[row[key]]) {
        codes.push(row[key]);
        rows = rows.filter(d => d[key] !== row[key]);
        found = true;
        break;
      }
    }
    if (!found) codes.push(rows.shift()[typecd]);
  }
  return codes.sort((a, b) => a.localeCompare(b));
}

test("complete sets of OAs are replaced by the highest complete parent", () => {
  assert.deepEqual(compressCensusCodes(oas("1"), lkp.oa, "oa"), ["LA1"]);
  assert.deepEqual(compressCensusCodes(oas("11"), lkp.oa, "oa"), ["MSOA11"]);
  assert.deepEqual(compressCensusCodes([...oas("111"), "OA1121"], lkp.oa, "oa"), ["LSOA111", "OA1121"]);
  assert.deepEqual(compressCensusCodes(["OA1111", "OA2222"], lkp.oa, "oa"), ["OA1111", "OA2222"]);
  assert.deepEqual(compressCensusCodes([], lkp.oa, "oa"), []);
});

test("LSOA and MSOA codes are compressed the same way", () => {
  assert.deepEqual(compressCensusCodes(["LSOA111", "LSOA112", "LSOA121"], lkp.lsoa, "lsoa"), ["LSOA121", "MSOA11"]);
  assert.deepEqual(compressCensusCodes(["MSOA21", "MSOA22", "MSOA11"], lkp.msoa, "msoa"), ["LA2", "MSOA11"]);
});

test("matches the original implementation for random subsets in any order", () => {
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const all = data.map(d => d.oa21cd);
  for (let i = 0; i < 500; i ++) {
    const subset = all.filter(() => rand() < 0.7).sort(() => rand() - 0.5);
    assert.deepEqual(compressCensusCodes(subset, lkp.oa, "oa"), reference(subset, lkp.oa, "oa"));
  }
});
