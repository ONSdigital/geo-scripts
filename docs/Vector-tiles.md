# Vector tiles

The URL pattern for these files is:

`https://cdn.ons.gov.uk/maptiles/{path}/{z}/{x}/{y}.pbf`

For example, this is the URL for 2024 electoral ward boundaries:

`https://cdn.ons.gov.uk/maptiles/administrative/2024/wd/v1/boundaries/{z}/{x}/{y}.pbf`

You can preview the [above wards tileset using Vector Inspector](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2024/wd/v1/boundaries/10/510/336.pbf&loc=10.44/52.2338/-0.072).

## About these files

Vector tiles are an efficient way of serving vector data for web maps (points, lines, polygons etc) at different levels of detail depending on a user's location and zoom level. This document offers [an introduction to vector tiles](https://docs.google.com/document/d/1d0Jluy8sE8sKHRPdny_n2D8L08qa4HS3jweplfcdiX0/edit), how to use them, and how to generate them.

The most typical ONS vector tiles use case is for interactive choropleth maps that cover small statistical areas, like [Census Maps](https://www.ons.gov.uk/census/maps/). They are also used on the area navigation pages of [Explore Local Statistics](https://www.ons.gov.uk/explore-local-statistics) to ensure that small and large area boundaries are aligned at higher zoom levels.

## Available tilesets

As of June 2026, the following tilesets are available:

Area type | Year | Path | Layer name | Fields | Preview
--- | --- | --- | --- | --- | ---
Local authorities (all levels) | 2023 | administrative/2023/authorities-all/v1/boundaries | boundaries | areacd,areanm,areanmw,cauth | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2023/authorities-all/v1/boundaries/8/127/83.pbf&loc=9/51.504/-0.1119)
Local authorities (all levels) | 2024 | administrative/2024/authorities-all/v1/boundaries | boundaries | areacd,areanm,areanmw,cauth | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2024/authorities-all/v1/boundaries/8/127/83.pbf&loc=9/51.504/-0.1119)
Local authorities (all levels) | 2025 | administrative/2025/authorities-all | boundaries | areacd,areanm,areanmw,cauth | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2025/authorities-all/8/127/83.pbf&loc=9/51.504/-0.1119)
Lower-tier local authorities | 2022 | administrative/2022/ltla/v1/boundaries | boundaries | areanm,areacd | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2022/ltla/v1/boundaries/8/127/83.pbf&loc=9/51.504/-0.1119)
Lower-tier local authorities | 2023 | administrative/2023/ltla/v1/boundaries | boundaries | areacd,areanm,areanmw | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2023/ltla/v1/boundaries/8/127/83.pbf&loc=9/51.504/-0.1119)
Parliamentary constituencies | 2010 | administrative/2010/wpc/v2/boundaries | boundaries | areacd,areanm | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2010/wpc/v2/boundaries/8/127/83.pbf&loc=9/51.504/-0.1119)
Parliamentary constituencies | 2024 | administrative/2024/wpc/v1/boundaries | boundaries | areacd,areanm | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2024/wpc/v1/boundaries/8/127/83.pbf&loc=9/51.504/-0.1119)
Electoral wards | 2022 | administrative/2022/wd/v1/boundaries | wd | areanm,areacd | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2022/wd/v1/boundaries/8/127/83.pbf&loc=0.18/0/0)
Electoral wards | 2023 | administrative/2023/wd/v1/boundaries | boundaries | areanm,areacd | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2023/wd/v1/boundaries/8/127/83.pbf&loc=9/51.504/-0.1119)
Electoral wards | 2024 | administrative/2024/wd/v1/boundaries | boundaries | areanm,areacd | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2024/wd/v1/boundaries/8/127/83.pbf&loc=9/51.504/-0.1119)
Electoral wards | 2025 | administrative/2025/wd | boundaries | areanm,areacd | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2025/wd/8/127/83.pbf&loc=9/51.504/-0.1119)
Parishes/communities | 2022 | administrative/2022/par/v1/boundaries | par | areanm,areacd | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2022/par/v1/boundaries/8/127/83.pbf&loc=0.18/0/0)
Senedd constituencies + regions | 2022 | administrative/2022/sen/v1/boundaries | region,constituency | areacd,areanm,areanmw | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2022/sen/v1/boundaries/9/252/170.pbf&loc=7/52.008/-3.396)
MSOA | 2021 | administrative/2021/msoa/v2/boundaries | msoa | areanm,areacd,hclnm | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2021/msoa/v2/boundaries/8/127/83.pbf&loc=0.18/0/0)
LSOA | 2021 | administrative/2021/lsoa/v3/boundaries | boundaries | areacd,parentcd | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2021/lsoa/v3/boundaries/8/127/83.pbf&loc=9/51.504/-0.1119)
Output Area | 2021 | administrative/2021/oa/v3/boundaries | boundaries | areacd,parentcd | [View](https://stevage.github.io/vector-inspector/#?url=https://cdn.ons.gov.uk/maptiles/administrative/2021/oa/v3/boundaries/8/127/83.pbf&loc=9/51.504/-0.1119)

## Detail levels

The scripts in this repo generate vector tiles using [Tippecanoe](https://github.com/felt/tippecanoe). Although Tippecanoe is capable of automatically simplifying the geometry for lower zoom levels, we make use of the generalised boundaries provided by the ONS Open Geography Portal to give a better quality output. Detail levels are mapped to zoom levels as follows:

Code | Name | Zoom level | Notes
-- | -- | -- | --
BUC | Boundaries, Ultra-generalised, Clipped | 0-5 | Very simplified. Smallest file size.
BSC | Boundaries, Super-generalised, Clipped | 6-7 | Quite simplified. Smaller file size.
BGC | Boundaries, Generalised detail, Clipped | 8-11 | Slightly simplified geometry, fairly large file size.
BFC | Boundaries, Full detail, Clipped to coastline | 12+ | As above, but clipped to coastlines and river banks, which is more suitable for use in most maps.
BFE | Boundaries, Full detail, Extent of realm | Not used | Most precise, largest file size. “Extent of realm” means that boundaries include rivers, water bodies and some of the sea.
