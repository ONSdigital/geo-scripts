# Postcode lookup files

The URL pattern for these files is:

`https://cdn.ons.gov.uk/maptiles/postcode-lookup/{version}/{postcode-prefix}.json`

For example, this URL returns the first ten postcodes starting "PO":

[https://cdn.ons.gov.uk/maptiles/postcode-lookup/v1/PO.json](https://cdn.ons.gov.uk/maptiles/postcode-lookup/v1/PO.json)

## About these files

These files each contain a list of postcodes and the longitude and latitude coordinates representing their centroid.

A one, two or three-character prefix - eg. **P**, **PO** or **PO1** - will return the first 10 postcodes that contain that start with that prefix (alphabetically sorted). A four-character prefix - eg. **PO14** will return _all_ matching postcodes. Lookup files are not generated beyond four characters.

The purpose of these files is to power postcode autocomplete and lookup services. In [Explore Local Statistics](https://www.ons.gov.uk/explore-local-statistics/), these files are used in the postcode autocomplete on the home page, and in combination with the [GeoJSON tiles](GeoJSON-tiles.md) to power a postcode search capable of returning all of the relevant areas covering a specific postcode. For example, here is the [result for PO15 5RR](https://www.ons.gov.uk/explore-local-statistics/areas/search?q=PO15%205RR).

## File structure

Here is an example of the output format in the postcode lookup files. It follows a [column-oriented JSON arrays](https://github.com/ONSdigital/explore-local-statistics-app/wiki/Data-formats#json-column-oriented-arrays) format:

```json5
{
  "cd": ["PA1 1AA", "PA1 1AB", "PA1 1AD", "PA1 1AE", "PA1 1AF", "PA1 1AG", "PA1 1AH", "PA1 1AJ", "PA1 1AL", "PA1 1AN"],
  "lat": [55.846874, 55.846771, 55.844032, 55.844714, 55.843827, 55.844137, 55.843687, 55.842959, 55.844032, 55.844032],
  "lng": [-4.422785, -4.424791, -4.418295, -4.417906, -4.418218, -4.426656, -4.420765, -4.414826, -4.418295, -4.418295]
}
```