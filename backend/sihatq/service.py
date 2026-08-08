from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from .constants import (
    AGE_PERCENTAGE_BASIS,
    ETHNICITY_CODES,
    ETHNICITY_LABELS,
    ETHNICITY_OPTIONS,
    MALAYSIAN_STATES,
    SEX_CODES,
    SEX_OPTIONS,
    SEX_PERCENTAGE_BASIS,
    SUPPORTED_AGE_GROUPS,
)
from .models import AllCauseContext, MortalityRecord
from .schemas import (
    AllCauseContextResponse,
    CauseStat,
    ComparisonRow,
    ComparisonView,
    InsightRequest,
    InsightsResponse,
    MatchResponse,
    MetadataResponse,
    ProfileResponse,
)


SOURCE_DESCRIPTION = (
    "Department of Statistics Malaysia, Statistics on Causes of Death, "
    "Malaysia, 2025 (reference year 2024)."
)
DISCLAIMER = (
    "These results describe population-level recorded deaths and do not predict "
    "your personal health outcome, provide a diagnosis, or replace medical advice."
)


def _age_group_description(age_group: str) -> str:
    if age_group == "0":
        return "under age 1"
    if age_group == "85 dan lebih 85 and over":
        return "85 and over"
    return age_group


def _percentage(value: object) -> float | None:
    return None if value is None else float(value)


def _cause_stats(records: Iterable[MortalityRecord]) -> list[CauseStat]:
    ordered = sorted(records, key=lambda item: (-item.death_count, item.cause_of_death))
    return [
        CauseStat(
            display_rank=index,
            cause_of_death=record.cause_of_death,
            death_count=record.death_count,
            percentage=_percentage(record.percentage),
        )
        for index, record in enumerate(ordered, start=1)
    ]


def _comparison_view(
    *,
    records: Iterable[MortalityRecord],
    groups: tuple[str, ...],
    group_attribute: str,
    selected_group: str | None,
    dimension_type: str,
    cause: str,
    percentage_basis: str,
    scope_note: str,
    require_groups: int = 2,
) -> ComparisonView:
    by_group = {getattr(record, group_attribute): record for record in records}
    rows = [
        ComparisonRow(
            group=group,
            death_count=by_group[group].death_count,
            percentage=_percentage(by_group[group].percentage),
        )
        for group in groups
        if group in by_group
    ]
    missing_groups = [group for group in groups if group not in by_group]
    return ComparisonView(
        available=len(rows) >= require_groups,
        dimension_type=dimension_type,
        cause_of_death=cause,
        selected_group=selected_group,
        percentage_basis=percentage_basis,
        scope_note=scope_note,
        missing_groups=missing_groups,
        rows=rows,
    )


def _all_cause_context(
    session: Session,
    request: InsightRequest,
) -> AllCauseContextResponse:
    sex_code = SEX_CODES[request.sex]
    ethnicity_code = ETHNICITY_CODES[request.ethnicity]
    record = session.scalar(
        select(AllCauseContext).where(
            AllCauseContext.year == request.year,
            AllCauseContext.state == request.state,
            AllCauseContext.sex == sex_code,
            AllCauseContext.ethnicity == ethnicity_code,
        )
    )
    matching_method = (
        "overall_ethnicity_fallback"
        if request.ethnicity == "Prefer not to say"
        else "exact_state_sex_ethnicity"
    )
    ethnicity_label = ETHNICITY_LABELS[ethnicity_code]
    sex_label = "both sexes" if sex_code == "both" else request.sex.lower()
    scope = f"{request.state}, {sex_label}, {ethnicity_label}"

    if record is None or record.death_count is None:
        return AllCauseContextResponse(
            available=False,
            death_count=None,
            unit="registered deaths",
            is_age_specific=False,
            scope=scope,
            matching_method="unavailable",
            note=(
                "The separate registered-deaths dataset does not report a usable "
                "2024 value for this state, sex and ethnicity combination. Missing "
                "data has not been interpreted as zero."
            ),
        )

    return AllCauseContextResponse(
        available=True,
        death_count=record.death_count,
        unit="registered deaths",
        is_age_specific=False,
        scope=scope,
        matching_method=matching_method,
        note=(
            "This value comes from a separate registered-deaths dataset grouped by "
            "usual state of residence, sex and ethnicity. It includes all registered "
            "causes and is not directly comparable with the medically certified cause "
            "counts above."
        ),
    )


def build_insights(session: Session, request: InsightRequest) -> InsightsResponse:
    primary_records = list(
        session.scalars(
            select(MortalityRecord).where(
                MortalityRecord.year == request.year,
                MortalityRecord.dimension_type == "state_age_group",
                MortalityRecord.state == request.state,
                MortalityRecord.sex == "All",
                MortalityRecord.age_group == request.age_group,
            )
        )
    )
    dimension_type = "state_age_group"
    comparison_state = request.state
    matching_method = "exact_state_age"
    age_description = _age_group_description(request.age_group)
    comparison_group = f"People aged {age_description} in {request.state}"

    if not primary_records:
        primary_records = list(
            session.scalars(
                select(MortalityRecord).where(
                    MortalityRecord.year == request.year,
                    MortalityRecord.dimension_type == "national_age_group",
                    MortalityRecord.state == "Malaysia",
                    MortalityRecord.sex == "All",
                    MortalityRecord.age_group == request.age_group,
                )
            )
        )
        dimension_type = "national_age_group"
        comparison_state = "Malaysia"
        matching_method = "national_age_fallback"
        comparison_group = f"People aged {age_description} in Malaysia"

    if not primary_records:
        raise LookupError(
            f"No mortality data is available for {request.age_group} in {request.year}."
        )

    causes = _cause_stats(primary_records)
    selected_cause = causes[0].cause_of_death
    selected_causes = tuple(cause.cause_of_death for cause in causes)
    source_tables = sorted({record.source_table for record in primary_records})

    age_records = list(
        session.scalars(
            select(MortalityRecord).where(
                MortalityRecord.year == request.year,
                MortalityRecord.dimension_type == dimension_type,
                MortalityRecord.state == comparison_state,
                MortalityRecord.sex == "All",
                MortalityRecord.age_group.in_(SUPPORTED_AGE_GROUPS),
                MortalityRecord.cause_of_death.in_(selected_causes),
            )
        )
    )

    state_records = list(
        session.scalars(
            select(MortalityRecord).where(
                MortalityRecord.year == request.year,
                MortalityRecord.dimension_type == "state_age_group",
                MortalityRecord.state.in_(MALAYSIAN_STATES),
                MortalityRecord.sex == "All",
                MortalityRecord.age_group == request.age_group,
                MortalityRecord.cause_of_death.in_(selected_causes),
            )
        )
    )

    sex_records = list(
        session.scalars(
            select(MortalityRecord).where(
                MortalityRecord.year == request.year,
                MortalityRecord.dimension_type == "state_sex",
                MortalityRecord.state == request.state,
                MortalityRecord.sex.in_(("Male", "Female")),
                MortalityRecord.age_group == "All ages",
                MortalityRecord.cause_of_death.in_(selected_causes),
            )
        )
    )

    comparisons_by_cause: dict[str, dict[str, ComparisonView]] = {}
    for cause in selected_causes:
        comparisons_by_cause[cause] = {
            "age": _comparison_view(
                records=(
                    record for record in age_records if record.cause_of_death == cause
                ),
                groups=SUPPORTED_AGE_GROUPS,
                group_attribute="age_group",
                selected_group=request.age_group,
                dimension_type=dimension_type,
                cause=cause,
                percentage_basis=AGE_PERCENTAGE_BASIS,
                scope_note=(
                    f"Recorded counts across supported age bands in {comparison_state}."
                ),
            ),
            "state": _comparison_view(
                records=(
                    record for record in state_records if record.cause_of_death == cause
                ),
                groups=MALAYSIAN_STATES,
                group_attribute="state",
                selected_group=request.state,
                dimension_type="state_age_group",
                cause=cause,
                percentage_basis=AGE_PERCENTAGE_BASIS,
                scope_note=(
                    "Raw recorded counts for the same age band. States whose source "
                    "table did not select this cause are omitted, not treated as zero; "
                    "these are not population-adjusted rates."
                ),
            ),
            "sex": _comparison_view(
                records=(
                    record for record in sex_records if record.cause_of_death == cause
                ),
                groups=("Male", "Female"),
                group_attribute="sex",
                selected_group=(
                    None if request.sex == "Prefer not to say" else request.sex
                ),
                dimension_type="state_sex",
                cause=cause,
                percentage_basis=SEX_PERCENTAGE_BASIS,
                scope_note=(
                    "All-ages top-ten cause data for the selected state. A missing "
                    "sex row means the cause was not reported in that sex's top ten, "
                    "not zero deaths."
                ),
                require_groups=2,
            ),
        }

    comparisons = comparisons_by_cause[selected_cause]

    return InsightsResponse(
        profile=ProfileResponse(**request.model_dump()),
        data_year=request.year,
        match=MatchResponse(
            dimension_type=dimension_type,
            comparison_group=comparison_group,
            matching_method=matching_method,
            source_tables=source_tables,
            selected_cause=selected_cause,
            percentage_basis=AGE_PERCENTAGE_BASIS,
            causes=causes,
        ),
        all_cause_context=_all_cause_context(session, request),
        comparisons=comparisons,
        comparisons_by_cause=comparisons_by_cause,
        source=SOURCE_DESCRIPTION,
        limitations=[
            "Cause records include medically certified deaths only.",
            "The source provides state-and-age and state-and-sex tables separately; it does not provide a combined state, age, sex and ethnicity cause table.",
            "The age tables contain selected causes, so these results must not be described as a complete ranking of every cause.",
            "Age-table percentages use a different denominator from state-sex percentages.",
            "State comparisons show counts rather than population-adjusted rates.",
            "The separate all-cause context is not age-specific and should not be compared directly with medically certified cause counts.",
        ],
        disclaimer=DISCLAIMER,
    )


def build_metadata(session: Session) -> MetadataResponse:
    years = list(
        session.scalars(
            select(MortalityRecord.year).distinct().order_by(MortalityRecord.year.desc())
        )
    )
    return MetadataResponse(
        years=years,
        states=list(MALAYSIAN_STATES),
        age_groups=list(SUPPORTED_AGE_GROUPS),
        sexes=list(SEX_OPTIONS),
        ethnicities=list(ETHNICITY_OPTIONS),
        primary_match_dimensions=["state", "age_group"],
        source=SOURCE_DESCRIPTION,
    )

