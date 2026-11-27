# Area metadata files

The URL pattern for these files is:

`https://cdn.ons.gov.uk/maptiles/ap-geos/{version}/{gss_prefix}/{gss_code}.json`

For example, this URL returns a file for Norwich (non-metropolitan district):

[https://cdn.ons.gov.uk/maptiles/ap-geos/v4/E07/E07000148.json](https://cdn.ons.gov.uk/maptiles/ap-geos/v4/E07/E07000148.json)

The format described below, with children in groups, is version 5 (`ap-geos/v5`). Version 4 files have a flat `children` list, as `[{"areacd": string, "areanm": string}]`, and lower case `groupnm`/`typenm` names (eg. "local authority district").

## About these files

These GeoJSON files contain metadata and boundary polygons for individual geographic areas that are used by [Explore Local Statistics](https://www.ons.gov.uk/explore-local-statistics/) and [Build a custom area profile](https://www.ons.gov.uk/visualisations/customprofiles/).

_Note: An older/simpler area metadata format is also generated for [Census Maps](https://www.ons.gov.uk/census/maps/). Its structure is described in the next section._

Metadata includes name, GSS code and parent/child areas, centroid, bounding box and temporal validity (ie. start/end year, if relevant). They also include best-fits for Census 2021 statistical areas.*

The files are generated using [ONS Open Geography Portal](https://geoportal.statistics.gov.uk) data for a wide range of geographies from country level down to Output Area level ([see list below](#area-types-covered)). For Scotland and Northern Ireland, the files are only generated down to local authority level.

## File structure

### Current format

```json5
{
  "type": "Feature",
  "properties": {
    "areacd": string, // GSS code
    "areanm": string, // Official name
    "areanmw": string, // Welsh name (only for areas in Wales)
    "hclnm": string, // Commons Library name (only for MSOAs)
    "hclnmw": string, // Commons Library Welsh name (only for MSOAs in Wales)
    "areakm2": number, // Area in square kilometres (clipped to the coastline)
    "bounds": [number, number, number, number], // Bounding box of area polygon
    "centroid": [number, number], // Centroid (pole of inaccessibility)
    "groupcd": string, // eg. "ltla"
    "groupnm": string, // eg. "Lower tier/unitary authority"
    "typecd": string, // GSS code prefix, eg. "E07"
    "typenm": string, // eg. "Non-metropolitan district" (often same as "groupnm")
    "children": object[], // Child areas in groups, in form {"key": string, "label": string, "areas": object[]} (see below)
    "child_typecds": string[], // Array of type codes of child areas, eg. ["E02", "E04", "E05"]
    "parents": object[], // Array of parents, starting with closest, in form {"areacd": string, "areanm": string}
    "oa21cds": string[], // Census 2021 Output Area best-fit lookup*
    "lsoa21cds": string[], // Census 2021 LSOA best-fit lookup*
    "msoa21cds": string[], // Census 2021 MSOA best-fit lookup*
    "geometry": {
      "type": string, // "Polygon" or "MultiPolygon"
      "coordinates": [] // GeoJSON coordinates for the area boundary
    }
  }
}
```

#### Children

Each child area appears once, in one group. Groups are ordered from the largest kind of area to the smallest, and the areas in each group are sorted by name (by `hclnm` for MSOAs). Each area is in form `{"areacd": string, "areanm": string}`, plus `areanmw`, `hclnm` and `hclnmw` where they exist.

The authorities that are immediate children of an area are one group, so that together they cover the area. Its `key` and `label` depend on what it contains:

| Contains | key | label |
|---|---|---|
| Combined authorities and other authorities | `cauth` | Upper tier/combined authority |
| Only combined authorities | `cauth` | Combined authority |
| Counties and unitary authorities | `utla` | Upper tier/unitary authority |
| Only counties | `cty` | County |
| Unitary authorities and/or districts | `ltla` | Lower tier/unitary authority |

Other children are grouped by area type, with the `groupcd` and `groupnm` of that type as `key` and `label` (eg. `wpc`, `wd`, `par`, `ttwa`, `bua`, `msoa`). For example, the North West (E12000002):

```json5
"children": [
  {"key": "cauth", "label": "Upper tier/combined authority", "areas": [
    {"areacd": "E06000049", "areanm": "Cheshire East"},
    {"areacd": "E06000050", "areanm": "Cheshire West and Chester"},
    // ...
  ]},
  {"key": "wpc", "label": "Parliamentary constituency", "areas": [/* ... */]},
  {"key": "ttwa", "label": "Travel to work area", "areas": [/* ... */]}
]
```

A combined authority can extend beyond its region (eg. Greater Lincolnshire, in the East Midlands, includes two unitary authorities in Yorkshire and the Humber), so the authorities can cover more than the area.

_*Census 2021 lookups are "compressed" based on the geography hierarchy at the time of that census. If all of the Output Areas in an LSOA are present, they are represented by that LSOA code. If all of the LSOAs in an MSOA are present, then they are replaced by the MSOA code, and so on up to national level. Local authorities that are new since 2021 are represented by the codes of the smaller areas that were merged to create them._

### Census Map legacy format

```json5
{
  "meta": {
    "code": string, // GSS code
    "name": string, // Official name
    "geotype": string // "LAD", "MSOA" or "OA"
  },
  "geo_json": {
    "type": "FeatureCollection",
    "features": [
    {
      "type": "Point",
      "id": "centroid",
      "coordinates": [number, number]}, // Area centroid
      "properties": null
    },
    {
      "type": "Feature",
      "id":"bbox",
      "geometry": {
        "type": "LineString",
        "coordinates": [[number, number], [number, number]] // Area bounding box
      },
      "properties": null
    },
    {
      "type": "Feature",
      "id":"boundary",
      "geometry": {
        "type": string, // "Polygon" or "MultiPolygon"
        "coordinates": [] // GeoJSON coordinates for the area boundary
      },
      "properties": null
    }
  ]
}
```

## Area types covered

The area types covered by area metadata files can be [found on this page](Area-types-covered.md).