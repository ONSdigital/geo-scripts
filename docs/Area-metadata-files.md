# Area metadata files

The URL pattern for these files is:

`https://cdn.ons.gov.uk/maptiles/ap-geos/{version}/{gss_prefix}/{gss_code}.json`

For example, this URL returns a file for Norwich (non-metropolitan district):

[https://cdn.ons.gov.uk/maptiles/ap-geos/v4/E07/E07000148.json](https://cdn.ons.gov.uk/maptiles/ap-geos/v4/E07/E07000148.json)

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
    "groupnm": string, // eg. "lower-tier local authority"
    "typecd": string, // GSS code prefix, eg. "E07"
    "typenm": string, // eg. "non-metropolitan district" (often same as "groupnm")
    "children": object[], // Array of child areas in form {"areacd": string, "areanm": string}
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