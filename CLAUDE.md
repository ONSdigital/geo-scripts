# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Node scripts (ESM, `"type": "module"`) used by the ONS Data Visualisation team. They download boundary and lookup data from the ONS Open Geography Portal (ArcGIS FeatureServer / opendata.arcgis.com) and produce geographic outputs for Census Maps, Build a Custom Area Profile, Explore Local Statistics and other products. Changes to the Geoportal service or dataset IDs are the most common cause of breakage.

There is no build step or linter. `npm test` runs unit tests (`node:test`, in `test/`) for `scripts/lib/` and for config consistency; they need no input data or network. The scripts themselves have no tests, so check changes to them by running them on real inputs and comparing outputs before and after (outputs are deterministic, so a refactor should produce byte-identical files).

## Commands

```bash
npm install
npm test                                  # all tests
node --test test/spatial.test.js          # one test file
npm run <script-name> -- --help           # each script is `node ./scripts/<script-name>.js`
npm run make-geos -- --geo ltla,wd        # limit a script to some geographies (and --year where supported)
npm run all-scripts -- --geo wd           # scripts/run-all.js: download-files → get-metadata → get-relations → make-lists → get-best-fits → make-geos
npm run check-sources                     # check config/source-files.js against the Geoportal; suggest replacements and new releases
tileserver-gl-light ./output/vtiles/{file}.mbtiles   # preview vector tiles (separate global install)
```

External CLI dependencies that the scripts shell out to through `run()` in `scripts/utils.js`: **GDAL** (`ogr2ogr`), **Tippecanoe** (`tippecanoe`, `tile-join`), plus `zip`, `unzip`, `gzip` and `rm`. The scripts only run on macOS or Linux/WSL, with Node 22+.

## Pipeline and data flow

Scripts must run in dependency order. They talk to each other through files in `input/`, not through imports:

1. **download-files**: reads `config/source-files.js`. Its keys (`boundaries`, `centroids`, `census`, `other`) map to `input/<key>/`. Geo layers are paged from the ArcGIS API (`scripts/lib/arcgis.js`, with retries from `scripts/lib/http.js`), checked against the API's feature count, their properties are renamed to `areacd`/`areanm`/`areanmw`, and they are converted with `ogr2ogr` to gzipped **GeoJSONSeq** (one feature per line), named `input/boundaries/{key}{YY}_{detail}.json.gz`. Files are written under temporary names and renamed when complete, so an existing file is always complete; existing files are skipped unless `--force` is given. The ArcGIS API returns errors as HTTP 200 with an `{"error": ...}` body, and retired datasets give "Token Required" or "Invalid URL".
2. **get-metadata**: reads the `_bfc` boundary file for every geography/year in `geo-config.js`, and the House of Commons Library MSOA names, then writes `input/lookups/lookup_metadata.csv` and `lookup_names.csv` (the names file is used as tile-join attributes for vtiles). It derives start/end years from which vintages a code appears in.
3. **get-relations**: finds each area's `parentcd` and `successorcd` by point-in-polygon (centroid in parent BFE polygon), so no official parent lookups are needed. Writes the **master lookup** `input/lookups/lookup.csv` (committed) and `lookup_cauth.csv`.
4. **make-lists**: writes `output/lists/{key}{YY}.csv` and `{ap,cp}_places.csv` from `lookup.csv`, based on each geo's `list` setting. `output/lists` is the only committed part of `output/`.
5. **get-best-fits**: uses OA/LSOA/MSOA 2021 population-weighted centroids (`input/centroids/*_pwc`) and `input/census/oa21_lsoa21_msoa21_ltla22.csv` to write `input/lookups/lookup_bestfit_{oa,lsoa,msoa}21.json` (committed).
6. **make-geos**: writes per-area gzipped GeoJSON to `output/geos/{typecd}/{areacd}.json`, with parents, children, centroid, bounds, `areakm2` and compressed Census 2021 best-fits. Years are processed newest first and each area is written once, so an area's file comes from the newest year it appears in (this is why `make-geos` and `get-best-fits` don't accept `--year`). `--clean` deletes the selected types' folders first. **make-cm-geos** then derives the Census Maps legacy format in `output/cm-geos` from it.

`get-metadata`, `get-relations` and `make-search-tiles` always need every geography and refuse `--geo`/`--year`. A selected `get-best-fits` run merges into the existing best-fit JSON files.

These are independent and are not part of `all-scripts`:
- **make-vtiles** (`config/vtiles-config.js` + `config/vtiles-detail.js`): one Tippecanoe run per detail level/zoom band, joined with `tile-join` and given attributes from `lookup_names.csv` (and an optional `metadata` CSV) → `output/vtiles/{key}{YY}.mbtiles`. Intermediate files go in `temp/`, which is cleared when all outputs exist.
- **make-oa-vtiles-lookups** → **make-oa-vtiles**: OA tiles where small OAs are explicitly dissolved into their LSOA/MSOA parents at low zooms (uses mapshaper).
- **zip-vtiles**: `tile-join -e` unpacks each mbtiles into `{z}/{x}/{y}.pbf` directories, which are then zipped for static hosting on S3/CDN.
- **make-postcodes**: unpacks the NSPL (`input/other/nspl.zip`) → `output/postcodes/{prefix}.json` (prefixes of 1–4 characters).
- **make-search-tiles**: z12 GeoJSON tiles for reverse geocoding (point-in-polygon) → `output/search{YY}/{x}/{y}.json`.
- **check-centroids**: checks the generated `output/geos`.

Many `.json` outputs are **gzipped despite the `.json` extension**. Read them with `readGzip()` from utils, or rename them to `.gz` before decompressing.

## Config is the main thing you edit

You should be able to add new geographies or years by editing config only:
- `config/source-files.js`: Geoportal dataset IDs, one `{key, year, code, ids: {detail: datasetName}}` entry per geography/year, expanded to files by `expandGeoSources()` in `scripts/lib/sources.js`. Field names are `{code}{YY}{CD|NM|NMW}`, matched case-insensitively. A detail slot can point at a different detail level when the Geoportal hasn't published one (e.g. `cauth25`'s `buc` is a BSC dataset); keep the slot name, because tilesets reference files by slot. Dataset IDs go stale as the Geoportal re-versions datasets; `npm run check-sources` finds replacements, and its suggestions should be reviewed rather than applied blindly.
- `config/geo-config.js`: geography types (`key`, GSS `codes` prefixes, `parents`, `years`, `detail`, `list`, flags `notree`/`nolookup`/`listparents`, Census Maps `cmkey`). **Administrative geographies must be listed in hierarchy order** (e.g. E07 → E10 → E47 → E12 → E92) so that parent-finding works. `utils.js` imports this file too, to set the polylabel precision for each code prefix.
- `config/vtiles-config.js`: tilesets. A tileset can combine several `sources`, each a `{key, year, layer}`.
- `config/geo-types.js`: friendly type names for GSS prefixes.
- `config/paths.js`: every input/lookup/output location. `output/lists/` and `input/lookups/lookup.csv` are linked from GitHub by downstream users, so don't move them.

For partial outputs, use `--geo`/`--year` (`scripts/lib/cli.js`) instead of commenting out config. `test/config.test.js` checks hierarchy order, unique codes, required boundary files per script and tileset sources, so run `npm test` after editing config.

Detail level → zoom mapping (`vtiles-detail.js`): BUC z0–5, BSC z6–7, BGC z8–11, BFC z12+. BFE (extent of realm) is used only for accurate lookups and point-in-polygon, never for tiles. Coordinate precision is 6 dp for `bf*`/`pwc`, 5 dp for `bg*`/`bs*`, and 4 dp for `bu*`.

## Conventions

- Area property names are used across all outputs: `areacd`, `areanm`, `areanmw`, `hclnm`, `hclnmw`, `parentcd`, `successorcd`, `start`, `end`. Year suffixes are two digits (`ltla25`).
- Centroids are poles of inaccessibility (`findPolylabel` in utils), taken on the largest polygon of a MultiPolygon. A check throws if the point falls outside the polygon.
- Large boundary files are streamed line by line with `line-by-line` over gunzip. Don't load them whole.
- For many points against one polygon, use `preparePointInPolygon()` and the grid indexes in `scripts/lib/spatial.js`. They give the same results as turf (including boundary points) but are far faster on full-detail BFE polygons.
- `input/` and `output/` are gitignored, except for the few files whitelisted in `.gitignore` (UK boundaries, `lookup.csv`, best-fit JSONs, `output/lists`). Regenerating these changes committed data.

## Output documentation

`docs/` (migrated from the GitHub wiki; index at `docs/README.md`) documents each output's public CDN URL pattern and file schema: area metadata files (`cdn.ons.gov.uk/maptiles/ap-geos/{version}/{prefix}/{code}.json`), postcode lookups, GeoJSON search tiles, area lists, the master lookup, the vector tilesets table, and area types covered. Treat those schemas as a public contract: changing output properties affects downstream apps. `docs/Deploying-to-S3.md` covers uploading to S3: the JSON and `.pbf` outputs, and the tileset `metadata.json` files (gzipped in place by `zip-vtiles`), are already gzipped and need `Content-Encoding: gzip`. If you change an output format or add a tileset or area type, update the matching page in `docs/` (e.g. the tileset table in `docs/Vector-tiles.md`, `docs/Area-types-covered.md`).
