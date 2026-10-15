// Source files downloaded by scripts/download-files.js.
//
// boundaries and centroids come from the ONS Open Geography Portal API, one entry per geography and year:
//   - key/year match config/geo-config.js, and files are saved as ./input/{boundaries|centroids}/{key}{yy}_{detail}.json.gz
//   - code is the field prefix in the dataset, eg. "LAD" for LAD25CD, LAD25NM, LAD25NMW (case doesn't matter)
//   - ids maps each detail level to a Geoportal dataset (service) name
//
// Boundaries are needed for every year of every geography. Every detail level is included for
// the benefit of the vector tiles; BFE files are used for calculating accurate lookups.
//
// The Geoportal sometimes retires datasets or replaces them with new versions (eg. "_V2"). Run
// `npm run check-sources` to check these IDs and to find newly published years.
export default {
  boundaries: [
    {key: "ctry", year: 2022, code: "CTRY", ids: {
      bfe: "Countries_December_2022_UK_BFE",
      bfc: "Countries_December_2022_UK_BFC",
      bgc: "Countries_December_2022_UK_BGC",
      buc: "Countries_December_2022_UK_BUC",
    }},
    {key: "rgn", year: 2022, code: "RGN", ids: {
      bfe: "Regions_December_2022_EN_BFE",
      bfc: "Regions_December_2022_EN_BFC",
      bgc: "Regions_December_2022_EN_BGC",
      buc: "Regions_December_2022_EN_BUC",
    }},
    {key: "cauth", year: 2022, code: "CAUTH", ids: {
      bfe: "Combined_Authorities_December_2022_EN_BFE",
      bfc: "Combined_Authorities_December_2022_EN_BFC",
      bgc: "Combined_Authorities_December_2022_EN_BGC",
      buc: "Combined_Authorities_December_2022_EN_BUC",
    }},
    {key: "cauth", year: 2024, code: "CAUTH", ids: {
      bfe: "Combined_Authorities_May_2023_Boundaries_EN_BFE",
      bfc: "Combined_Authorities_May_2023_Boundaries_EN_BFC",
      bgc: "Combined_Authorities_May_2023_Boundaries_EN_BGC",
      buc: "Combined_Authorities_May_2023_Boundaries_EN_BUC",
    }},
    {key: "cauth", year: 2025, code: "CAUTH", ids: {
      bfe: "CAUTH_MAY_2025_EN_BFE",
      bfc: "CAUTH_MAY_2025_EN_BFC",
      bgc: "CAUTH_MAY_2025_EN_BGC",
      buc: "CAUTH_MAY_2025_EN_BSC", // BSC used for the BUC slot (no BUC published for this year)
    }},
    {key: "cty", year: 2022, code: "CTY", ids: {
      bfe: "Counties_December_2022_EN_BFE",
      bfc: "Counties_December_2022_EN_BFC",
      bgc: "Counties_December_2022_EN_BGC",
      buc: "Counties_December_2022_EN_BUC",
    }},
    {key: "cty", year: 2023, code: "CTY", ids: {
      bfe: "Counties_May_2023_Boundaries_EN_BFE",
      bfc: "Counties_May_2023_Boundaries_EN_BFC",
      bgc: "Counties_May_2023_Boundaries_EN_BGC",
      buc: "Counties_May_2023_Boundaries_EN_BUC",
    }},
    {key: "ltla", year: 2022, code: "LAD", ids: {
      bfe: "LAD_DEC_2022_UK_BFE_V2",
      bfc: "Local_Authority_Districts_December_2022_Boundaries_UK_BFC",
      bgc: "Local_Authority_Districts_December_2022_Boundaries_UK_BGC",
      buc: "Local_Authority_Districts_December_2022_Boundaries_UK_BUC",
    }},
    {key: "ltla", year: 2023, code: "LAD", ids: {
      bfe: "Local_Authority_Districts_May_2023_UK_BFE",
      bfc: "Local_Authority_Districts_May_2023_UK_BFC",
      bgc: "Local_Authority_Districts_May_2023_UK_BGC",
      buc: "Local_Authority_Districts_May_2023_UK_BUC",
    }},
    {key: "ltla", year: 2025, code: "LAD", ids: {
      bfe: "LAD_MAY_2025_UK_BFE",
      bfc: "LAD_MAY_2025_UK_BFC",
      bgc: "LAD_MAY_2025_UK_BGC",
      buc: "LAD_MAY_2025_UK_BSC", // BSC used for the BUC slot (no BUC published for this year)
    }},
    {key: "wpc", year: 2022, code: "PCON", ids: {
      bfe: "PCON_DEC_2022_UK_BFE_V2",
      bfc: "Westminster_Parliamentary_Constituencies_Dec_2022_UK_BFC",
      bgc: "Westminster_Parliamentary_Constituencies_Dec_2022_UK_BGC",
      buc: "Westminster_Parliamentary_Constituencies_Dec_2022_UK_BUC",
    }},
    {key: "wpc", year: 2024, code: "PCON", ids: {
      bfe: "Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BFE",
      bfc: "Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BFC",
      bgc: "Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BGC",
      buc: "Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC",
    }},
    {key: "sener", year: 2022, code: "SENER", ids: {
      bfe: "Senedd_Cymru_Electoral_Regions_December_2022_WA_BFE",
      bfc: "Senedd_Cymru_Electoral_Regions_December_2022_WA_BFC",
      bgc: "Senedd_Cymru_Electoral_Regions_December_2022_WA_BGC",
      buc: "Senedd_Cymru_Electoral_Regions_December_2022_WA_BUC",
    }},
    {key: "senc", year: 2022, code: "SENC", ids: {
      bfe: "Senedd_Cymru_Constituencies_December_2022_Boundaries_WA_BFE",
      bfc: "Senedd_Cymru_Constituencies_December_2022_Boundaries_WA_BFC",
      bgc: "Senedd_Cymru_Constituencies_December_2022_Boundaries_WA_BGC",
      buc: "Senedd_Cymru_Constituencies_December_2022_Boundaries_WA_BUC",
    }},
    {key: "par", year: 2022, code: "PAR", ids: {
      bfe: "Parishes_Decemeber_2022_EW_BFE",
      bfc: "Parishes_December_2022_EW_BFC",
      bgc: "Parishes_December_2022_EW_BGC",
      bsc: "Parishes_December_2022_EW_BSC",
    }},
    {key: "wd", year: 2022, code: "WD", ids: {
      bfe: "Wards_December_2022_Boundaries_GB_BFE",
      bfc: "Wards_December_2022_Boundaries_GB_BFC",
      bgc: "Wards_December_2022_Boundaries_GB_BGC",
      bsc: "Wards_December_2022_Boundaries_GB_BSC",
    }},
    {key: "wd", year: 2023, code: "WD", ids: {
      bfe: "WD_MAY_2023_UK_BFE",
      bfc: "WD_MAY_2023_UK_BFC",
      bgc: "WD_MAY_2023_UK_BGC",
      bsc: "WD_MAY_2023_UK_BSC",
    }},
    {key: "wd", year: 2024, code: "WD", ids: {
      bfe: "Wards_May_2024_Boundaries_UK_BFE",
      bfc: "Wards_May_2024_Boundaries_UK_BFC",
      bgc: "Wards_May_2024_Boundaries_UK_BGC",
      bsc: "Wards_May_2024_Boundaries_UK_BSC",
    }},
    {key: "wd", year: 2025, code: "WD", ids: {
      bfe: "WD_MAY_2025_UK_BFE",
      bfc: "WD_MAY_2025_UK_BFC",
      bgc: "WD_MAY_2025_UK_BGC",
      bsc: "WD_MAY_2025_UK_BSC",
    }},
    {key: "ttwa", year: 2011, code: "TTWA", ids: {
      bfe: "Travel_to_Work_Areas_Dec_2011_FEB_in_United_Kingdom_2022",
      bfc: "Travel_to_Work_Areas_Dec_2011_FCB_in_United_Kingdom_2022",
      bgc: "Travel_to_Work_Areas_Dec_2011_GCB_in_United_Kingdom_2022",
      buc: "Travel_to_Work_Areas_Dec_2011_UGCB_in_United_Kingdom_2022",
    }},
    {key: "bua", year: 2022, code: "BUA", ids: {
      bfc: "BUA_2022_GB",
    }},
    {key: "msoa", year: 2021, code: "MSOA", ids: {
      bfe: "Middle_Layer_Super_Output_Areas_2021_EW_BFE_V6",
      bfc: "Middle_Layer_Super_Output_Areas_Dec_2021_Boundaries_Full_Clipped_EW_BFC_2022",
      bgc: "MSOA_Dec_2021_Boundaries_Generalised_Clipped_EW_BGC_2022",
      bsc: "MSOA_2021_EW_BSC",
    }},
    {key: "lsoa", year: 2021, code: "LSOA", ids: {
      bfe: "Lower_Layer_Super_Output_Area_2021_EW_BFE_V8",
      bfc: "LSOA_Dec_2021_Boundaries_Full_Clipped_EW_BFC_2022",
      bgc: "LSOA_Dec_2021_Boundaries_Generalised_Clipped_EW_BGC_V2",
      bsc: "LSOA_2021_EW_BSC",
    }},
    {key: "oa", year: 2021, code: "OA", ids: {
      bfe: "Output_Areas_2021_EW_BFE_V8",
      bfc: "Output_Areas_Dec_2021_Boundaries_Full_Clipped_EW_BFC_2022",
      bgc: "Output_Areas_Dec_2021_Boundaries_Generalised_Clipped_EW_BGC_2022",
    }},
  ],
  centroids: [
    {key: "oa", year: 2021, code: "OA", ids: {
      pwc: "Output_Areas_2021_PWC_V3",
    }},
    {key: "lsoa", year: 2021, code: "LSOA", ids: {
      pwc: "LLSOA_Dec_2021_PWC_for_England_and_Wales_2022",
    }},
    {key: "msoa", year: 2021, code: "MSOA", ids: {
      pwc: "Middle_Super_Output_Areas_DEC_2021_EW_PWC",
    }},
  ],
  census: [
    // This is a frozen Census 2021 lookup for interfacing with the Nomis API
    {name: "oa21_lsoa21_msoa21_ltla22.csv", id: "b9ca90c10aaa4b8d9791e9859a38ca67_0", fields: ["OA21CD", "LSOA21CD", "MSOA21CD", "LAD22CD"], names: ["oa21cd", "lsoa21cd", "msoa21cd", "ltla22cd"]},
  ],
  other: [
    {name: "msoa_names.csv", href: "https://houseofcommonslibrary.github.io/msoanames/MSOA-Names-Latest2.csv"},
    {name: "nspl.zip", href: "https://www.arcgis.com/sharing/rest/content/items/077631e063eb4e1ab43575d01381ec33/data"},
  ],
};
