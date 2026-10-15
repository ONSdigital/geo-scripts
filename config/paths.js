// Locations of input, intermediate and output files.
// Keep output/lists and input/lookups/lookup.csv where they are: they are linked to
// from GitHub by downstream users (see docs/Area-lists.md and docs/Master-lookup.md).

// Two-digit year suffix used in file names, eg. 2025 -> "25"
export const yy = (year) => String(year).slice(-2);

export const dirs = {
  // Downloaded source data (see config/source-files.js)
  boundaries: "./input/boundaries",
  centroids: "./input/centroids",
  census: "./input/census",
  other: "./input/other",
  // Lookups derived from the source data
  lookups: "./input/lookups",
  // Scratch space for intermediate files (emptied by some scripts)
  temp: "./temp",
  // Outputs
  geos: "./output/geos",
  cmGeos: "./output/cm-geos",
  lists: "./output/lists",
  vtiles: "./output/vtiles",
  postcodes: "./output/postcodes",
  search: (year) => `./output/search${yy(year)}`
};

export const files = {
  // Boundary file for a geography, year and detail level, eg. ./input/boundaries/ltla25_bgc.json.gz
  boundary: (key, year, detail) => `${dirs.boundaries}/${key}${yy(year)}_${detail}.json.gz`,
  centroids: (key, year) => `${dirs.centroids}/${key}${yy(year)}_pwc.json.gz`,
  censusLookup: `${dirs.census}/oa21_lsoa21_msoa21_ltla22.csv`,
  msoaNames: `${dirs.other}/msoa_names.csv`,
  nspl: `${dirs.other}/nspl.zip`,
  // Written by get-metadata
  metadata: `${dirs.lookups}/lookup_metadata.csv`,
  names: `${dirs.lookups}/lookup_names.csv`,
  // Written by get-relations (the committed master lookup)
  lookup: `${dirs.lookups}/lookup.csv`,
  cauth: `${dirs.lookups}/lookup_cauth.csv`,
  // Written by get-best-fits (committed)
  bestFit: (key) => `${dirs.lookups}/lookup_bestfit_${key}21.json`,
  // Written by make-oa-vtiles-lookups
  vtilesLookup: (key) => `${dirs.lookups}/lookup_vtiles_${key}21.csv`
};
