# Source file archive

The ONS Open Geography Portal sometimes retires or replaces the datasets these scripts download. To keep the source files available, and the same for everyone who runs the scripts, they are archived as release assets in a separate public repository:

[https://github.com/ONSdigital/geo-source-files/releases](https://github.com/ONSdigital/geo-source-files/releases)

Release assets can be up to 2 GB each, so the 100 MB limit on files committed to GitHub doesn't apply. They don't count towards Git LFS quotas, and they can be downloaded without a GitHub account.

## How it's organised

- **One release per geography and year,** tagged `{key}-{year}` (eg. `wd-2025`). It holds that year's files exactly as `download-files` saves them (eg. `wd25_bfc.json.gz`, gzipped GeoJSONSeq).
- **The `other` release** holds the census lookup, the MSOA names and the NSPL.
- **Each release has a `manifest.json`,** listing every file's SHA-256 checksum, size, source dataset and the date it was archived.

There is one version of each file. When a file is corrected or replaced, the archived copy is overwritten under the same tag; superseded versions aren't kept.

## Downloading

`npm run download-files` uses the archive first:

- If the archive has a file, it is downloaded from there and its checksum is checked.
- If a local copy differs from the archived one (eg. because the archived file has been corrected), the local copy is replaced.
- Files that aren't in the archive are downloaded from the Geoportal, as before.

To ignore the archive and download from the Geoportal, add `--source geoportal`.

## Archiving files

To archive files, you need write access to the archive repository and the [GitHub CLI](https://cli.github.com/) installed and logged in (`gh auth login`). Then run:

```bash
npm run archive-sources -- --geo wd --year 2026 --dry-run   # see what would be uploaded
npm run archive-sources -- --geo wd --year 2026
```

Only files that are new or have changed are uploaded. Each release's `manifest.json` is uploaded last, so it only ever lists files that are in place. (`archive-sources` reads the existing manifests through the GitHub API, because the public download links can take a few minutes to show newly uploaded files. Until then, `download-files` may still use the Geoportal for those files.)

Without `--geo`/`--year`, every downloaded source file is archived, including the census and other files (add `--other` to include those with a selection).

If uploads fail with connection errors such as `tls: bad record MAC`, try connecting to the VPN, or a different network: some connections interfere with uploads to GitHub.

### Adding a new year

1. Run `npm run check-sources` and add the suggested entry to `config/source-files.js` (see the [README](../README.md#updating-the-config-files)).
2. Download it from the Geoportal: `npm run download-files -- --geo wd --year 2026`
3. Archive it: `npm run archive-sources -- --geo wd --year 2026`

### Replacing a file

If a dataset has been corrected on the Geoportal, or a better dataset is found, update `config/source-files.js` if needed, then:

```bash
npm run download-files -- --geo wd --year 2025 --source geoportal --force
npm run archive-sources -- --geo wd --year 2025
```

Use `--source geoportal` in the first step: otherwise `download-files` would replace your new download with the archived copy.
