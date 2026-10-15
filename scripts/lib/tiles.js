// Splits the line-by-line output of `tippecanoe-decode` into tiles of GeoJSON features.
// Each tile starts with a FeatureCollection header line giving its zoom/x/y, followed
// by one feature per line.
const HEADER = '{ "type": "FeatureCollection", "properties": { "zoom":';

export function createTileSplitter(onTile) {
  let current = null;

  const flush = () => {
    if (current && current.features.length > 0) onTile(current);
  };

  return {
    line(line) {
      if (line.startsWith(HEADER)) {
        flush();
        const x = +line.match(/(?<="x":\s)\d+(?=,)/)[0];
        const y = +line.match(/(?<="y":\s)\d+(?=\s)/)[0];
        current = {x, y, features: []};
      }

      let feature;
      try {
        feature = JSON.parse(line);
      } catch {
        // Other lines (headers, closing brackets) aren't features
      }
      if (feature?.type === "Feature") current.features.push(feature);
    },
    // The last tile has no following header, so must be flushed at the end
    end() {
      flush();
      current = null;
    }
  };
}
