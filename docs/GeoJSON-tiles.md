# GeoJSON tiles

The URL pattern for these files is:

`https://cdn.ons.gov.uk/maptiles/area-lookup/{version}/{x}/{y}.json`

For example, this URL returns the tile covering the [web map tile](https://en.wikipedia.org/wiki/Tiled_web_map) XYZ coordinates `{x: 2033, y: 1373, z: 12}`:

[https://cdn.ons.gov.uk/maptiles/area-lookup/v1/2033/1373.json](https://cdn.ons.gov.uk/maptiles/area-lookup/v1/2033/1373.json)

_Note: These files are only generated for zoom level 12, so the zoom level is not included in the URL._

## About these files

These files each contain a GeoJSON FeatureCollection representing areas at any geographic level (from Output Area up to country/region) that fall within the web map tile area that they represent.

The purpose of these files is for use in "reverse geocoding" applications, where a point-in-polygon search can be used to return all of the areas that a specific longitude/latitude coordinate pair falls within.

In [Explore Local Statistics](https://www.ons.gov.uk/explore-local-statistics/), these files are used in combination with the [Postcode lookup files](Postcode-lookup-files.md) to power a postcode search capable of returning all of the relevant areas covering a specific postcode. For example, here is the [result for PO15 5RR](https://www.ons.gov.uk/explore-local-statistics/areas/search?q=PO15%205RR).

The "start" and "end" years enable applications where it is necessary for areas to be filtered for a specific point in time.

## File structure

```json5
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "areacd": string, // GSS code
        "areanm": string, // Official name
        "start": number, // Start year (only if new)
        "end": number // Last valid year (only if superseded)
      },
      "geometry: {
        "type": string, // "Polygon" or "MultiPolygon"
        "coordinates": [] // GeoJSON coordinates for the area boundary
      }
    },
    ...
  ]
}
```

## Area types covered

The area types covered by the GeoJSON tiles can be [found on this page](Area-types-covered.md).
