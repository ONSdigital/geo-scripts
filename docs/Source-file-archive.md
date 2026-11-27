# Source file archive

The ONS Open Geography Portal sometimes retires or replaces the datasets these scripts download. To keep the source files available, and the same for everyone who runs the scripts, they are archived as release assets in a separate public repository:

[https://github.com/ONSdigital/geo-source-files/releases](https://github.com/ONSdigital/geo-source-files/releases)

Release assets can be up to 2 GB each, so the 100 MB limit on files committed to GitHub doesn't apply. They don't count towards Git LFS quotas, and they can be downloaded without a GitHub account.

## How it's organised

- **One release per geography and year,** tagged `{key}-{year}` (eg. `wd-2025`). It holds that year's files exactly as `download-files` saves them (eg. `wd25_bfc.json.gz`, gzipped GeoJSONSeq).
- **The `lookups` release** holds the census lookup, the NSPL (the full CSV, gzipped) and the MSOA names. Only the current version of each is kept: a new NSPL edition, or an updated version of the MSOA names, replaces the archived one.
- **Each release has a `manifest.json`,** listing every file's SHA-256 checksum, size, source dataset and the date it was archived.

There is one version of each file. When a file is corrected or replaced, the archived copy is overwritten under the same tag; superseded versions aren't kept. Each release should hold exactly the files that `config/source-files.js` names for it (see [Removing files](#removing-files)). If versioned releases are needed in future, they should get their own tags rather than sharing one.

## Downloading

`npm run download-files` uses the archive first:

- If the archive has a file, it is downloaded from there and its checksum is checked.
- If a local copy differs from the archived one (eg. because the archived file has been corrected), the local copy is replaced.
- Files that aren't in the archive are downloaded from the Geoportal, as before.

To ignore the archive and download from the Geoportal, add `--source geoportal`.

`download-files` records which dataset each file came from in `input/sources.json`. If `config/source-files.js` is changed to use a different dataset for a file, the file is downloaded again, and an archived copy from a different dataset isn't used. `archive-files` won't archive a file that was downloaded from a different dataset than the config now lists.

## Archiving files

To archive files, you need write access to the archive repository and the [GitHub CLI](https://cli.github.com/) installed and logged in (`gh auth login`). Then run:

```bash
npm run archive-files -- --geo wd --year 2026 --dry-run   # see what would be uploaded
npm run archive-files -- --geo wd --year 2026
```

Only files that are new or have changed are uploaded. Each release's `manifest.json` is uploaded last, so it only ever lists files that are in place. (`archive-files` reads the existing manifests through the GitHub API, because the public download links can take a few minutes to show newly uploaded files. Until then, `download-files` may still use the Geoportal for those files.)

Without `--geo`/`--year`, every downloaded source file is archived, including the lookups (add `--lookups` to include those with a selection).

### Adding a new year

1. Run `npm run check-sources` and add the suggested entry to `config/source-files.js` (see the [README](../README.md#updating-the-config-files)).
2. Download it from the Geoportal: `npm run download-files -- --geo wd --year 2026`
3. Archive it: `npm run archive-files -- --geo wd --year 2026`

### Replacing a file

If a dataset has been corrected on the Geoportal, or a better dataset is found, update `config/source-files.js` if needed, then:

```bash
npm run download-files -- --geo wd --year 2025 --source geoportal --force
npm run archive-files -- --geo wd --year 2025
```

Use `--source geoportal` in the first step: otherwise `download-files` would replace your new download with the archived copy.

### Removing files

`archive-files` only adds and replaces files. When a file is renamed or removed from `config/source-files.js` (eg. the census lookup, renamed when its region column was added), the old file stays in the archive until you prune it:

```bash
npm run archive-files -- --prune --dry-run   # see what would be removed
npm run archive-files -- --prune
```

With `--prune`, after uploading, `archive-files` removes from each release any file the config doesn't name for it, and the file's entry in that release's `manifest.json`. The manifest is updated first, so it never lists a removed file. Without `--geo`/`--year`, it also deletes any release (and its tag) for a geography and year that's no longer in the config. With a selection, only the selected releases are pruned. Files the config names are never removed, even if they haven't been downloaded locally.
