from sqlalchemy import delete

from sihatq.models import MortalityRecord
from sihatq.schemas import InsightRequest
from sihatq.service import build_insights


PROFILE = {
    "year": 2024,
    "age_group": "45-49",
    "state": "Selangor",
    "sex": "Male",
    "ethnicity": "Malay",
}


def test_health_and_metadata(client) -> None:
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["database"] == "connected"

    metadata = client.get("/api/v1/metadata")
    assert metadata.status_code == 200
    payload = metadata.json()
    assert payload["years"] == [2024]
    assert payload["age_groups"] == [
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
    assert len(payload["states"]) == 16


def test_selangor_profile_returns_expected_selected_causes(client) -> None:
    response = client.post("/api/v1/insights", json=PROFILE)
    assert response.status_code == 200
    payload = response.json()
    assert payload["match"]["matching_method"] == "exact_state_age"
    assert payload["match"]["percentage_basis"] == "share_of_cause_deaths_in_age_group"
    assert [cause["death_count"] for cause in payload["match"]["causes"]] == [285, 66, 51, 33, 26]
    assert [cause["cause_of_death"] for cause in payload["match"]["causes"]] == [
        "Ischaemic heart diseases",
        "Pneumonia",
        "Transport accidents",
        "Diabetes mellitus",
        "Kidney failure",
    ]
    assert payload["all_cause_context"]["available"] is True
    assert payload["all_cause_context"]["death_count"] == 8967
    assert payload["comparisons"]["age"]["selected_group"] == "45-49"
    assert payload["comparisons"]["state"]["scope_note"].startswith("Raw recorded counts")
    assert list(payload["comparisons_by_cause"]) == [
        "Ischaemic heart diseases",
        "Pneumonia",
        "Transport accidents",
        "Diabetes mellitus",
        "Kidney failure",
    ]
    assert payload["comparisons_by_cause"]["Pneumonia"]["age"]["cause_of_death"] == "Pneumonia"
    assert set(payload["comparisons_by_cause"]["Kidney failure"]) == {
        "age",
        "state",
        "sex",
    }


def test_invalid_profile_returns_422(client) -> None:
    invalid = {**PROFILE, "state": "Not a Malaysian state"}
    response = client.post("/api/v1/insights", json=invalid)
    assert response.status_code == 422


def test_youngest_and_oldest_age_groups_are_supported(client) -> None:
    youngest = client.post("/api/v1/insights", json={**PROFILE, "age_group": "0"})
    assert youngest.status_code == 200
    assert youngest.json()["match"]["comparison_group"] == (
        "People aged under age 1 in Selangor"
    )

    oldest = client.post(
        "/api/v1/insights",
        json={**PROFILE, "age_group": "85 dan lebih 85 and over"},
    )
    assert oldest.status_code == 200
    assert oldest.json()["match"]["comparison_group"] == (
        "People aged 85 and over in Selangor"
    )


def test_local_frontend_origin_is_allowed(client) -> None:
    response = client.options(
        "/api/v1/insights",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_blank_other_ethnicity_is_unavailable_not_zero(client) -> None:
    response = client.post(
        "/api/v1/insights",
        json={**PROFILE, "ethnicity": "Other"},
    )
    assert response.status_code == 200
    context = response.json()["all_cause_context"]
    assert context["available"] is False
    assert context["death_count"] is None
    assert "not been interpreted as zero" in context["note"]


def test_missing_state_age_uses_national_fallback(db_session) -> None:
    transaction = db_session.begin_nested()
    try:
        db_session.execute(
            delete(MortalityRecord).where(
                MortalityRecord.year == 2024,
                MortalityRecord.dimension_type == "state_age_group",
                MortalityRecord.state == "Selangor",
                MortalityRecord.age_group == "45-49",
            )
        )
        result = build_insights(db_session, InsightRequest(**PROFILE))
        assert result.match.matching_method == "national_age_fallback"
        assert result.match.comparison_group == "People aged 45-49 in Malaysia"
    finally:
        transaction.rollback()


def test_partial_sex_comparison_is_flagged_not_zero_filled(db_session) -> None:
    transaction = db_session.begin_nested()
    try:
        db_session.execute(
            delete(MortalityRecord).where(
                MortalityRecord.year == 2024,
                MortalityRecord.dimension_type == "state_sex",
                MortalityRecord.state == "Selangor",
                MortalityRecord.sex == "Female",
                MortalityRecord.cause_of_death == "Ischaemic heart diseases",
            )
        )
        result = build_insights(db_session, InsightRequest(**PROFILE))
        comparison = result.comparisons["sex"]
        assert comparison.available is False
        assert comparison.missing_groups == ["Female"]
        assert [row.group for row in comparison.rows] == ["Male"]
    finally:
        transaction.rollback()
