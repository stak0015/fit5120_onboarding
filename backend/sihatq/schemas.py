from typing import Literal

from pydantic import BaseModel, Field


AgeGroup = Literal[
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
]
State = Literal[
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
]
Sex = Literal["Male", "Female", "Prefer not to say"]
Ethnicity = Literal[
    "Malay",
    "Chinese",
    "Indian",
    "Other Bumiputera",
    "Other",
    "Prefer not to say",
]
ActivityLevel = Literal["Rarely", "Sometimes", "Regularly"]
SmokingStatus = Literal[
    "Current smoker", "Former smoker", "Non-smoker", "Prefer not to say"
]
AlcoholUse = Literal["None", "Occasionally", "Frequently", "Prefer not to say"]
DietaryPattern = Literal[
    "Mostly balanced", "Mixed", "Often highly processed", "Prefer not to say"
]
FamilyHistory = Literal[
    "No known history",
    "Heart disease",
    "Diabetes",
    "Cancer",
    "Other",
    "Prefer not to say",
]
SleepQuality = Literal["Poor", "Fair", "Good", "Prefer not to say"]
StressLevel = Literal["Low", "Moderate", "High", "Prefer not to say"]
ActionCategory = Literal[
    "movement",
    "nutrition",
    "smoking",
    "alcohol",
    "sleep",
    "stress",
    "preventive_care",
]
LifestyleBasis = Literal[
    "activity",
    "smoking",
    "alcohol",
    "diet",
    "family_history",
    "sleep_quality",
    "stress_level",
]


class InsightRequest(BaseModel):
    year: int = Field(default=2024, ge=2000, le=2100)
    age_group: AgeGroup
    state: State
    sex: Sex
    ethnicity: Ethnicity


class ActionSuggestionRequest(InsightRequest):
    activity: ActivityLevel
    smoking: SmokingStatus
    alcohol: AlcoholUse
    diet: DietaryPattern
    family_history: FamilyHistory
    sleep_quality: SleepQuality
    stress_level: StressLevel


class PopulationContextItem(BaseModel):
    cause_of_death: str
    death_count: int = Field(ge=0)


class GeneratedActionSuggestion(BaseModel):
    category: ActionCategory
    title: str = Field(min_length=4, max_length=100)
    action: str = Field(min_length=10, max_length=280)
    target: str = Field(min_length=3, max_length=120)
    timeframe_weeks: int = Field(ge=1, le=12)
    rationale: str = Field(min_length=10, max_length=360)
    lifestyle_basis: list[LifestyleBasis] = Field(min_length=1, max_length=7)
    population_basis: list[str] = Field(max_length=5)
    professional_support_note: str | None


class GeneratedActionBatch(BaseModel):
    suggestions: list[GeneratedActionSuggestion] = Field(min_length=3, max_length=5)


class ActionSuggestion(GeneratedActionSuggestion):
    suggestion_id: str


class ActionSuggestionResponse(BaseModel):
    request_id: str
    generation_mode: Literal["ai", "curated", "curated_fallback"]
    fallback_reason: Literal[
        "not_configured",
        "provider_connection",
        "provider_timeout",
        "provider_rate_limited",
        "provider_rejected_request",
        "invalid_output",
        "safety_rejected",
        "unexpected_error",
    ] | None
    model: str | None
    provider_processing: bool
    comparison_group: str
    population_context: list[PopulationContextItem]
    suggestions: list[ActionSuggestion] = Field(min_length=3, max_length=5)
    notice: str
    disclaimer: str


class ProfileResponse(BaseModel):
    year: int
    age_group: str
    state: str
    sex: str
    ethnicity: str


class CauseStat(BaseModel):
    display_rank: int
    cause_of_death: str
    death_count: int
    percentage: float | None


class MatchResponse(BaseModel):
    dimension_type: str
    comparison_group: str
    matching_method: str
    source_tables: list[str]
    selected_cause: str
    percentage_basis: str
    causes: list[CauseStat]


class ComparisonRow(BaseModel):
    group: str
    death_count: int
    percentage: float | None


class ComparisonView(BaseModel):
    available: bool
    dimension_type: str
    cause_of_death: str
    selected_group: str | None
    percentage_basis: str
    scope_note: str
    missing_groups: list[str]
    rows: list[ComparisonRow]


class AllCauseContextResponse(BaseModel):
    available: bool
    death_count: int | None
    unit: str
    is_age_specific: bool
    scope: str
    matching_method: str
    note: str


class InsightsResponse(BaseModel):
    profile: ProfileResponse
    data_year: int
    match: MatchResponse
    all_cause_context: AllCauseContextResponse
    comparisons: dict[Literal["age", "state", "sex"], ComparisonView]
    comparisons_by_cause: dict[
        str, dict[Literal["age", "state", "sex"], ComparisonView]
    ]
    source: str
    limitations: list[str]
    disclaimer: str


class MetadataResponse(BaseModel):
    years: list[int]
    states: list[str]
    age_groups: list[str]
    sexes: list[str]
    ethnicities: list[str]
    primary_match_dimensions: list[str]
    source: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    database: Literal["connected"]
    environment: str

