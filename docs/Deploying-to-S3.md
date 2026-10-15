# Deploying to S3

The JSON and vector tile outputs are served from an AWS S3 bucket, behind CloudFront and Cloudflare, at `https://cdn.ons.gov.uk/maptiles/...`. Only a few people have write access to the bucket. This page lists the commands they need.

## How the files are served

Most outputs are **already gzipped** when the scripts write them, even though they keep their `.json` or `.pbf` extensions. They are uploaded as they are, with a `Content-Encoding: gzip` header. Browsers then decompress them automatically, so the files are smaller to store and quicker to download.

This only works if every file gets the right headers:

| Output | Local folder | Gzipped? | Content-Type | Content-Encoding |
| ------ | ------------ | -------- | ------------ | ---------------- |
| [Area metadata files](Area-metadata-files.md) | `output/geos/` | Yes | `application/json` | `gzip` |
| Census Maps area files | `output/cm-geos/` | Yes | `application/json` | `gzip` |
| [Postcode lookup files](Postcode-lookup-files.md) | `output/postcodes/` | Yes | `application/json` | `gzip` |
| [GeoJSON search tiles](GeoJSON-tiles.md) | `output/search{yy}/` | Yes | `application/json` | `gzip` |
| [Vector tiles](Vector-tiles.md) (`.pbf`) | unzipped from `output/vtiles/*.zip` | Yes | `application/x-protobuf` | `gzip` |
| Vector tile `metadata.json` | as above | Yes* | `application/json` | `gzip` |

\* `zip-vtiles` gzips each tileset's `metadata.json`, keeping its name. ZIPs made before this was added contain a plain `metadata.json`. Check with `xxd` (see below) and upload those without `Content-Encoding`.

Two common mistakes:
- **Missing `Content-Encoding`.** Clients receive compressed bytes they can't read.
- **`Content-Encoding: gzip` on a file that isn't gzipped,** such as an older plain `metadata.json`, a CSV or a ZIP. Clients fail to decompress it.

Area lists (`output/lists/`) and the master lookup are published on GitHub, not on S3.

## Before you start

You need the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) set up with credentials for the bucket. The examples below use these variables; ask a bucket owner for the real bucket name and profile:

```bash
export AWS_PROFILE=your-profile
BUCKET="s3://your-bucket-name/maptiles"
CACHE="max-age=7776000"  # 90 days, as used for the existing files
```

To check what you're running locally, use `file` or `xxd`. Gzipped files start with the bytes `1f8b`:

```bash
xxd -l2 -p output/geos/E07/E07000148.json   # 1f8b = gzipped
```

## Upload commands

Add `--dryrun` to any of these commands to list what would be uploaded without uploading anything.

**Upload new versions to a new path instead of overwriting existing files** (for example `ap-geos/v5` rather than `ap-geos/v4`), then point the applications at the new path. There are two reasons:
- The CDN caches files for 90 days, in two layers (Cloudflare and CloudFront), so overwritten files can stay stale for a long time.
- `aws s3 sync` only compares file sizes and dates, so it won't fix the headers on files that are already there.

### Area metadata files

```bash
aws s3 cp output/geos "$BUCKET/ap-geos/v5" --recursive \
  --exclude "*" --include "*.json" \
  --content-type "application/json" --content-encoding "gzip" --cache-control "$CACHE"
```

Census Maps files (`output/cm-geos`) use the same flags, uploaded to the path that Census Maps reads from.

### Postcode lookup files

```bash
aws s3 cp output/postcodes "$BUCKET/postcode-lookup/v2" --recursive \
  --exclude "*" --include "*.json" \
  --content-type "application/json" --content-encoding "gzip" --cache-control "$CACHE"
```

### GeoJSON search tiles

```bash
aws s3 cp output/search25 "$BUCKET/area-lookup/v2" --recursive \
  --exclude "*" --include "*.json" \
  --content-type "application/json" --content-encoding "gzip" --cache-control "$CACHE"
```

### Vector tiles

`npm run zip-vtiles` turns each `.mbtiles` file into a ZIP of `{z}/{x}/{y}.pbf` tiles plus a gzipped `metadata.json`. Unzip the tileset you want, then upload the tiles and the metadata separately so that each gets the right content type:

```bash
unzip output/vtiles/wd25.zip -d temp/upload
TILES="$BUCKET/administrative/2025/wd"

aws s3 cp temp/upload/wd25 "$TILES" --recursive \
  --exclude "*" --include "*.pbf" \
  --content-type "application/x-protobuf" --content-encoding "gzip" --cache-control "$CACHE"

xxd -l2 -p temp/upload/wd25/metadata.json  # should be 1f8b; if not, drop --content-encoding below
aws s3 cp temp/upload/wd25/metadata.json "$TILES/metadata.json" \
  --content-type "application/json" --content-encoding "gzip" --cache-control "$CACHE"
```

Existing tilesets were uploaded with `Content-Type: text/pbf`. Map libraries such as MapLibre read either type.

## Checking an upload

Request a file with gzip accepted, and check the headers and the first bytes:

```bash
URL=https://cdn.ons.gov.uk/maptiles/ap-geos/v4/E07/E07000148.json
curl -sI -H "Accept-Encoding: gzip" "$URL" | grep -iE "content-(type|encoding)"
curl -s -H "Accept-Encoding: gzip" "$URL" | xxd -l2 -p  # 1f8b if Content-Encoding is gzip
```

If `Content-Encoding` is `gzip`, the first bytes should be `1f8b`. If they're anything else, such as `7b0a` (`{` and a newline), the file isn't gzipped and the header is wrong.

## Fixing headers on files already in S3

You can change an object's headers by copying it onto itself with `--metadata-directive REPLACE`. Every header must be given again, because this replaces them all. For example, to remove the incorrect `Content-Encoding: gzip` from a plain (not gzipped) `metadata.json`. Alternatively, upload a gzipped copy over it with the commands above:

```bash
aws s3 cp "$TILES/metadata.json" "$TILES/metadata.json" --metadata-directive REPLACE \
  --content-type "application/json" --cache-control "$CACHE"
```

The CDN will keep serving the cached copy until it expires, unless the cache is purged.

*In October 2026, every live tileset `metadata.json` checked was served with `Content-Encoding: gzip` but was not gzipped, so they need this fix. Those checked were 2021 MSOA, 2022 LTLA, 2024 WPC, 2025 authorities-all and 2025 wards.*
