# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Node scripts (ESM, `"type": "module"`) used by the ONS Data Visualisation team. They download boundary and lookup data from the ONS Open Geography Portal (ArcGIS FeatureServer / opendata.arcgis.com) and produce geographic outputs for Census Maps, Build a Custom Area Profile, Explore Local Statistics and other products. Changes to the Geoportal service or dataset IDs are the most common cause of breakage.

There is no build step, linter or test suite (`npm test` is a placeholder). To check a change, run the relevant script and look at its output.

## Commands

```bash
npm install
npm run <script-name>        # each script is `node ./scripts/<script-name>.js`
npm run all-scripts          # download-files → get-metadata → get-relations → make-lists → get-best-fits → make-geos (~30 min)
tileserver-gl-light ./output/vtiles/{file}.mbtiles   # preview vector tiles (separate global install)
```

External CLI dependencies that the scripts shell out to through `run()` in `scripts/utils.js`: **GDAL** (`ogr2ogr`), **Tippecanoe** (`tippecanoe`, `tile-join`), plus `curl`, `zip`, `unzip`, `gzip` and `rm`. The scripts only run on macOS or Linux/WSL.

## Pipeline and data flow

Scripts must run in dependency order. They talk to each other through files in `input/`, not through imports:

1. **download-files**: reads `config/source-files.js`. Its keys (`boundaries`, `centroids`, `census`, `other`) map to `input/<key>/`. Geo layers are paged from the ArcGIS API, their properties are renamed to `areacd`/`areanm`/`areanmw`, and they are converted with `ogr2ogr` to gzipped **GeoJSONSeq** (one feature per line), named `input/boundaries/{key}{YY}_{detail}.json.gz`. Files that already exist are skipped, so delete a file to force a re-download.
2. **get-metadata**: reads every boundary file and the House of Commons Library MSOA names, then writes `input/lookups/lookup_metadata.csv` and `lookup_names.csv` (the names file is used as tile-join attributes for vtiles). It derives start/end years from which vintages a code appears in.
3. **get-relations**: finds each area's `parentcd` and `successorcd` by point-in-polygon (centroid in parent BFE polygon), so no official parent lookups are needed. Writes the **master lookup** `input/lookups/lookup.csv` (committed) and `lookup_cauth.csv`.
4. **make-lists**: writes `output/lists/{key}{YY}.csv` and `{ap,cp}_places.csv` from `lookup.csv`, based on each geo's `list` setting. `output/lists` is the only committed part of `output/`.
5. **get-best-fits**: uses OA/LSOA/MSOA 2021 population-weighted centroids (`input/centroids/*_pwc`) and `input/census/oa21_lsoa21_msoa21_ltla22.csv` to write `input/lookups/lookup_bestfit_{oa,lsoa,msoa}21.json` (committed).
6. **make-geos**: writes per-area gzipped GeoJSON to `output/geos/{typecd}/{areacd}.json`, with parents, children, centroid, bounds and compressed Census 2021 best-fits. **`output/geos` must be empty before running.** **make-cm-geos** then derives the Census Maps legacy format in `output/cm-geos` from it.

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
- `config/source-files.js`: Geoportal dataset IDs. Each geography/year needs entries for every detail level (`bfe`, `bfc`, `bgc`, and `buc` or `bsc`). Field names are built as `{code}{YY}{CD|NM|NMW}`, and `code`'s case must match the source fields. Watch for inconsistent Geoportal naming (e.g. `cauth25_buc` actually points to a BSC dataset).
- `config/geo-config.js`: geography types (`key`, GSS `codes` prefixes, `parents`, `years`, `detail`, `list`, flags `notree`/`nolookup`/`listparents`, Census Maps `cmkey`). **Administrative geographies must be listed in hierarchy order** (e.g. E07 → E10 → E47 → E12 → E92) so that parent-finding works. `utils.js` imports this file too, to set the polylabel precision for each code prefix.
- `config/vtiles-config.js`: tilesets. A tileset can combine several `sources`, each a `{key, year, layer}`.
- `config/geo-types.js`: friendly type names for GSS prefixes.

To get partial outputs, comment out entries in `geo-config.js` / `vtiles-config.js`.

Detail level → zoom mapping (`vtiles-detail.js`): BUC z0–5, BSC z6–7, BGC z8–11, BFC z12+. BFE (extent of realm) is used only for accurate lookups and point-in-polygon, never for tiles. Coordinate precision is 6 dp for `bf*`/`pwc`, 5 dp for `bg*`/`bs*`, and 4 dp for `bu*`.

## Conventions

- Area property names are used across all outputs: `areacd`, `areanm`, `areanmw`, `hclnm`, `hclnmw`, `parentcd`, `successorcd`, `start`, `end`. Year suffixes are two digits (`ltla25`).
- Centroids are poles of inaccessibility (`findPolylabel` in utils), taken on the largest polygon of a MultiPolygon. A check throws if the point falls outside the polygon.
- Large boundary files are streamed line by line with `line-by-line` over gunzip. Don't load them whole.
- `input/` and `output/` are gitignored, except for the few files whitelisted in `.gitignore` (UK boundaries, `lookup.csv`, best-fit JSONs, `output/lists`). Regenerating these changes committed data.

## Output documentation

`docs/` (migrated from the GitHub wiki; index at `docs/README.md`) documents each output's public CDN URL pattern and file schema: area metadata files (`cdn.ons.gov.uk/maptiles/ap-geos/{version}/{prefix}/{code}.json`), postcode lookups, GeoJSON search tiles, area lists, the master lookup, the vector tilesets table, and area types covered. Treat those schemas as a public contract: changing output properties affects downstream apps. If you change an output format or add a tileset or area type, update the matching page in `docs/` (e.g. the tileset table in `docs/Vector-tiles.md`, `docs/Area-types-covered.md`).
