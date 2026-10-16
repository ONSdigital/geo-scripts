// Geography types. Each geography covers the years it has boundaries for in
// config/source-files.js, so years aren't set here.
//
// IMPORTANT:
// The administrative geographies need to be entered in the order of their hierarchy
// This is to ensure that English geographies find their all their parents
// eg. E07 -> E10 -> E47 -> E12 -> E92
import source_files from "./source-files.js";

const geographies = [
  {
    key: "uk",
		codes: ["K02"],
    label: "United Kingdom",
		parents: [],
    detail: "buc",
    // Made from the country boundaries, so it covers the same years
    virtual: {from: "ctry"}
  },
  {
    key: "ctry",
		codes: ["E92", "N92", "S92", "W92"],
		parents: ["K02"],
    label: "country",
    detail: "buc",
    list: ["ap", "cp"]
  },
  {
    key: "rgn",
		codes: ["E12"],
		parents: ["E92"],
    label: "region",
    list: ["ap", "cp"]
  },
  {
    key: "cauth",
		codes: ["E47"],
		parents: ["E12"],
    label: "combined authority",
    list: ["ap", "cp"]
  },
  {
    key: "cty",
		codes: ["E10"],
		parents: ["E47", "E12"],
    label: "county",
    list: ["ap", "cp"]
  },
  {
    key: "ltla",
    cmkey: "LAD",
    cmfilter: ["E", "W"],
		codes: ["E06", "E07", "E08", "E09", "N09", "S12", "W06"],
		parents: ["E10", "E47", "E12", "N92", "S92", "W92"],
    label: "local authority district",
    list: ["ap", "cp"]
  },
  {
    key: "wpc",
		codes: ["E14", "N05", "N06", "S14", "W07"],
		parents: ["E12", "N92", "S92", "W92"],
    label: "parliamentary constituency",
    list: ["ap", "cp"]
  },
  {
    key: "wd",
		codes: ["E05", "W05"],
		parents: ["E06", "E07", "E08", "E09", "W06"],
    label: "electoral ward",
    list: ["ap", "cp"],
    listparents: true
  },
  {
    key: "par",
		codes: ["E04", "W04"],
		parents: ["E06", "E07", "E08", "E09", "W06"],
    label: "civil parish",
    list: ["ap", "cp"],
    listparents: true
  },
  {
    key: "sener",
		codes: ["W10"],
		parents: ["W92"],
    label: "Senedd electoral region",
    list: ["ap", "cp"]
  },
  {
    key: "senc",
		codes: ["W09"],
		parents: ["W10"],
    label: "Senedd constituency",
    list: ["ap", "cp"]
  },
  {
    key: "ttwa",
		codes: ["E30", "K01", "W22"],
		parents: ["E12", "W92"],
    label: "travel to work area",
    list: ["cp"]
  },
  {
    key: "bua",
		codes: ["E63", "K08", "W45"],
		parents: ["E06", "E07", "E08", "E09", "W06"],
    label: "built up area",
    detail: "bfc",
    list: ["cp"]
  },
  {
    key: "msoa",
		codes: ["E02", "W02"],
		parents: ["E06", "E07", "E08", "E09", "W06"],
    cmkey: "MSOA",
    label: "middle layer super output area",
  },
  {
    key: "lsoa",
		codes: ["E01", "W01"],
		parents: ["E02", "W02"],
    label: "lower layer super output area",
    detail: "bfc"
  },
  {
    key: "oa",
		codes: ["E00", "W00"],
		parents: ["E01", "W01"],
    cmkey: "OA",
    label: "output area",
    detail: "bfc"
  },
];

// Years with boundaries in the source manifest, for a geography (or the geography
// a virtual geography is made from)
const yearsOf = (key) => [...new Set(source_files.boundaries.filter(e => e.key === key).map(e => e.year))].sort((a, b) => a - b);

export default geographies.map(g => ({...g, years: yearsOf(g.virtual?.from || g.key)}));
