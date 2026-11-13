// Census 2021 best-fit helpers, based on the frozen OA -> LSOA -> MSOA -> LTLA22 lookup
export const CENSUS_COLS = ["oa21cd", "lsoa21cd", "msoa21cd", "ltla22cd"];

// For each of oa/lsoa/msoa, an index of rows by code plus the number of members
// each higher-level code has, eg. counts["E02000001"] = number of OAs in that MSOA.
export function makeCensusLookup(data) {
  const lkp = {};
  for (const key of ["oa", "lsoa", "msoa"]) {
    const col = `${key}21cd`;
    const parent_cols = CENSUS_COLS.slice(CENSUS_COLS.indexOf(col) + 1);

    let filtered_data = [];
    if (key === "oa") filtered_data = data;
    else {
      const unique_cds = new Set();
      const filtered_cols = [col, ...parent_cols];
      for (const d of data) {
        if (!unique_cds.has(d[col])) {
          unique_cds.add(d[col]);
          const row = {};
          for (const c of filtered_cols) row[c] = d[c];
          filtered_data.push(row);
        }
      }
    }
    const lookup = {};
    const counts = {};
    for (const d of filtered_data) {
      lookup[d[col]] = d;
      for (const parent_col of parent_cols) {
        if (!counts[d[parent_col]]) counts[d[parent_col]] = 0;
        counts[d[parent_col]] ++;
      }
    }
    lkp[key] = {lookup, counts};
  }
  return lkp;
}

// "Compress" a list of codes of the given type by replacing complete sets of
// children with their parent code (eg. all OAs in an LSOA -> the LSOA code),
// preferring the highest complete level. Returns sorted codes.
export function compressCensusCodes(cds, c_lkp, type) {
  const typecd = `${type}21cd`;
  const higher = CENSUS_COLS.slice(CENSUS_COLS.indexOf(typecd) + 1).reverse();
  const rows = cds.map(cd => c_lkp.lookup[cd]);

  // How many of the remaining rows fall within each higher-level code
  const present = {};
  const members = {};
  rows.forEach((row, i) => {
    for (const key of higher) {
      const cd = row[key];
      present[cd] = (present[cd] || 0) + 1;
      (members[cd] ||= []).push(i);
    }
  });

  const removed = new Uint8Array(rows.length);
  const remove = (i) => {
    removed[i] = 1;
    for (const key of higher) present[rows[i][key]] --;
  };

  const codes = [];
  for (let i = 0; i < rows.length; i ++) {
    if (removed[i]) continue;
    const row = rows[i];
    const complete = higher.find(key => present[row[key]] === c_lkp.counts[row[key]]);
    if (complete) {
      codes.push(row[complete]);
      for (const j of members[row[complete]]) if (!removed[j]) remove(j);
    } else {
      codes.push(row[typecd]);
      remove(i);
    }
  }
  return codes.sort((a, b) => a.localeCompare(b));
}
