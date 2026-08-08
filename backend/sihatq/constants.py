SUPPORTED_YEAR = 2024

SUPPORTED_AGE_GROUPS = (
    "0",
    "1-4",
    "5-9",
    "10-14",
    "15-19",
    "20-24",
    "25-29",
    "30-34",
    "35-39",
    "40-44",
    "45-49",
    "50-54",
    "55-59",
    "60-64",
    "65-69",
    "70-74",
    "75-79",
    "80-84",
    "85 dan lebih 85 and over",
)

MALAYSIAN_STATES = (
    "Johor",
    "Kedah",
    "Kelantan",
    "Melaka",
    "Negeri Sembilan",
    "Pahang",
    "Perak",
    "Perlis",
    "Pulau Pinang",
    "Sabah",
    "Sarawak",
    "Selangor",
    "Terengganu",
    "W.P. Kuala Lumpur",
    "W.P. Labuan",
    "W.P. Putrajaya",
)

SEX_OPTIONS = ("Male", "Female", "Prefer not to say")
ETHNICITY_OPTIONS = (
    "Malay",
    "Chinese",
    "Indian",
    "Other Bumiputera",
    "Other",
    "Prefer not to say",
)

ETHNICITY_CODES = {
    "Malay": "bumi_malay",
    "Chinese": "chinese",
    "Indian": "indian",
    "Other Bumiputera": "bumi_other",
    "Other": "other_citizen",
    "Prefer not to say": "overall",
}

ETHNICITY_LABELS = {
    "bumi_malay": "Malay",
    "bumi_other": "Other Bumiputera",
    "chinese": "Chinese",
    "indian": "Indian",
    "other_citizen": "Other citizen",
    "other_noncitizen": "Non-citizen resident",
    "overall": "all ethnic groups",
}

SEX_CODES = {
    "Male": "male",
    "Female": "female",
    "Prefer not to say": "both",
}

MORTALITY_DIMENSIONS = (
    "national_age_group",
    "state_age_group",
    "state_sex",
)

AGE_PERCENTAGE_BASIS = "share_of_cause_deaths_in_age_group"
SEX_PERCENTAGE_BASIS = "share_of_all_medically_certified_deaths"

