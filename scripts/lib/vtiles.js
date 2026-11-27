// Helpers for vector tile metadata
import { bbox } from "@turf/turf";
import { pointInBBox, preparePointInPolygon } from "./spatial.js";

// Prepare polygon features for point-in-polygon tests
export function preparePolygons(features) {
  return features.map(f => ({areacd: f.properties.areacd, bounds: bbox(f), contains: preparePointInPolygon(f.geometry)}));
}

// Each area's parent among the given polygons: the first of its parent types (in
// hierarchy order) with a polygon containing the area's centroid. Polygons are grouped
// by type code, eg. {E10: [...], E47: [...]}. Returns a Map of areacd -> parentcd.
export function findParents(areas, polygonsByType) {
  const parents = new Map();
  for (const {areacd, centroid, parentTypes} of areas) {
    for (const type of parentTypes) {
      const parent = (polygonsByType[type] || []).find(p => pointInBBox(centroid, p.bounds) && p.contains(centroid));
      if (parent) {
        parents.set(areacd, parent.areacd);
        break;
      }
    }
  }
  return parents;
}
