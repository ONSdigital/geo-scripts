# Area lists

The URL pattern for these files (contained within this repo) is:

`https://github.com/ONSdigital/geo-scripts/blob/main/output/lists/{geo_type}{YY}.csv`

For example, this URL points to the file for the Lower-tier local authorities (LTLAs) that were valid in 2025:

[https://github.com/ONSdigital/geo-scripts/blob/main/output/lists/ltla25.csv](https://github.com/ONSdigital/geo-scripts/blob/main/output/lists/ltla25.csv)

In addition, the following area list file is generated to cover all the named areas included in [Build a Custom Area Profile](https://www.ons.gov.uk/visualisations/customprofiles/) (at all geography levels):

[https://github.com/ONSdigital/geo-scripts/blob/main/output/lists/cp_places.csv](https://github.com/ONSdigital/geo-scripts/blob/main/output/lists/cp_places.csv)

## About these files

These files offer simple code/name lists in a CSV format for all of the area types that [area metadata files](Area-metadata-files.md) are generated for.

The purpose of these files is to provide lists that can power a simple in-page area list/search interface (Eg. Enabling the search box on an interactive map).

## File structure

Example:

```csv
areacd,areanm
E06000001,Hartlepool
E06000002,Middlesbrough
E06000003,Redcar and Cleveland
E06000004,Stockton-on-Tees
E06000005,Darlington
E06000006,Halton
E06000007,Warrington
E06000008,Blackburn with Darwen
E06000009,Blackpool
E06000010,"Kingston upon Hull, City of"
...
```

## Area types covered

A list of area types covered by area list files can be [found on this page](Area-types-covered.md).