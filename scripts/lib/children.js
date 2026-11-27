// Groups an area's children for the area files, as Explore Local Statistics does, so
// that each child appears once, in a group of its kind of area.

// Administrative types that form a single group of the highest available authorities
const COMBINED_AUTHORITY = ["E47"];
const COUNTY = ["E10"];
const UNITARY = ["E06", "E08", "E09", "N09", "S12", "W06"];
const DISTRICT = ["E07"];
const AUTHORITY = new Set([...COMBINED_AUTHORITY, ...COUNTY, ...UNITARY, ...DISTRICT]);

// The key and label for a group of authorities, depending on what it contains. For
// example, a region's combined authorities and the unitary authorities outside them
// together cover the region, so they're one "Upper tier/combined authority" group.
export function authorityGroup(types) {
  const has = (codes) => types.some(t => codes.includes(t));
  const only = (codes) => types.every(t => codes.includes(t));
  if (has(COMBINED_AUTHORITY)) {
    return only(COMBINED_AUTHORITY) ?
      {key: "cauth", label: "Combined authority"} :
      {key: "cauth", label: "Upper tier/combined authority"};
  }
  if (has(COUNTY)) {
    return only(COUNTY) ?
      {key: "cty", label: "County"} :
      {key: "utla", label: "Upper tier/unitary authority"};
  }
  return {key: "ltla", label: "Lower tier/unitary authority"};
}

const name = (area) => area.hclnm || area.areanm || area.areacd || "";
const byName = (a, b) => name(a).localeCompare(name(b), "en-GB");

// Returns [{key, label, areas}]: authorities in one group (see authorityGroup), and
// other children grouped by their geography in geo-config.js. Groups are in geo-config
// order (largest areas first) and areas are sorted by name.
export function groupChildren(children, geoConfig) {
  const position = {};
  const geoByType = {};
  geoConfig.forEach((geo, i) => {
    for (const code of geo.codes) {
      position[code] = i;
      geoByType[code] = geo;
    }
  });

  const groups = new Map();
  for (const child of children) {
    const type = child.areacd.slice(0, 3);
    const id = AUTHORITY.has(type) ? "authorities" : geoByType[type]?.key || type;
    if (!groups.has(id)) groups.set(id, {position: Infinity, types: new Set(), areas: []});
    const group = groups.get(id);
    group.position = Math.min(group.position, position[type] ?? Infinity);
    group.types.add(type);
    group.areas.push(child);
  }

  return [...groups.entries()]
    .sort(([, a], [, b]) => a.position - b.position)
    .map(([id, group]) => {
      const types = [...group.types];
      const {key, label} = id === "authorities" ? authorityGroup(types) :
        geoByType[types[0]] ? {key: geoByType[types[0]].key, label: geoByType[types[0]].label} :
        {key: id, label: id};
      return {key, label, areas: group.areas.sort(byName)};
    });
}
