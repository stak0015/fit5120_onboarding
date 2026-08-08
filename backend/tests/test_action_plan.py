from sqlalchemy import func, select

from sihatq.action_plan import _fallback_details, build_action_suggestions
from sihatq.config import Settings
from sihatq.models import AllCauseContext, MortalityRecord
from sihatq.schemas import (
    ActionSuggestionRequest,
    GeneratedActionBatch,
    GeneratedActionSuggestion,
)


ACTION_PROFILE = {
    "year": 2024,
    "age_group": "45-49",
    "state": "Selangor",
    "sex": "Male",
    "ethnicity": "Malay",
    "activity": "Sometimes",
    "smoking": "Non-smoker",
    "alcohol": "Occasionally",
    "diet": "Mixed",
    "family_history": "Diabetes",
    "sleep_quality": "Fair",
    "stress_level": "Moderate",
}


def make_settings(*, enabled: bool = True, api_key: str | None = "test-key") -> Settings:
    return Settings(
        database_url="sqlite+pysqlite:///:memory:",
        cors_origins=("http://localhost:5173",),
        cors_origin_regex=None,
        environment="test",
        groq_api_key=api_key,
        groq_model="openai/gpt-oss-120b",
        groq_safety_model="openai/gpt-oss-safeguard-20b",
        action_suggestions_enabled=enabled,
        groq_timeout_seconds=5,
    )


def generated_batch(*, unsafe: bool = False) -> GeneratedActionBatch:
    action_text = (
        "Your risk is 70% so begin a treatment plan immediately."
        if unsafe
        else "Take a comfortable 20-minute walk on three days each week."
    )
    suggestions = [
        GeneratedActionSuggestion(
            category="movement",
            priority="high" if index == 0 else "medium",
            title=f"Build a walking routine {index + 1}",
            action=action_text if index == 0 else f"Schedule a short walk on day {index + 1} of each week.",
            target=f"Complete {index + 1} planned movement sessions",
            timeframe_weeks=4,
            rationale="This responds to the activity answer while keeping the action manageable.",
            lifestyle_basis=["activity"],
            population_basis=["Ischaemic heart diseases"] if index == 0 else [],
            professional_support_note=None,
        )
        for index in range(3)
    ]
    return GeneratedActionBatch(suggestions=suggestions)


class FakeGateway:
    model = "openai/gpt-oss-120b"

    def __init__(
        self,
        *,
        batch: GeneratedActionBatch | None = None,
        safe: bool = True,
        fail: bool = False,
    ) -> None:
        self.batch = batch or generated_batch()
        self.safe = safe
        self.fail = fail
        self.generate_calls = 0
        self.safety_calls = 0

    def generate(self, request, comparison_group, population_context):
        self.generate_calls += 1
        if self.fail:
            raise TimeoutError("provider timeout")
        assert comparison_group == "People aged 45-49 in Selangor"
        assert [item.death_count for item in population_context] == [285, 66, 51, 33, 26]
        return self.batch

    def is_safe(self, batch):
        self.safety_calls += 1
        return self.safe


def test_provider_connection_failure_has_an_actionable_reason() -> None:
    api_connection_error = type("APIConnectionError", (Exception,), {})
    reason, notice = _fallback_details(api_connection_error("connection failed"))

    assert reason == "provider_connection"
    assert "could not connect to Groq" in notice


def test_adult_profile_uses_validated_ai_suggestions(db_session) -> None:
    gateway = FakeGateway()
    result = build_action_suggestions(
        db_session,
        ActionSuggestionRequest(**ACTION_PROFILE),
        make_settings(),
        gateway=gateway,
    )

    assert result.generation_mode == "ai"
    assert result.fallback_reason is None
    assert result.provider_processing is True
    assert result.model == "openai/gpt-oss-120b"
    assert len(result.suggestions) == 3
    assert result.suggestions[0].population_basis == ["Ischaemic heart diseases"]
    assert gateway.generate_calls == 1
    assert gateway.safety_calls == 1


def test_under_20_profile_never_invokes_provider(db_session) -> None:
    gateway = FakeGateway(fail=True)
    request = ActionSuggestionRequest(**{**ACTION_PROFILE, "age_group": "15-19"})
    result = build_action_suggestions(
        db_session,
        request,
        make_settings(),
        gateway=gateway,
    )

    assert result.generation_mode == "curated"
    assert result.fallback_reason is None
    assert result.provider_processing is False
    assert result.model is None
    assert gateway.generate_calls == 0
    assert 3 <= len(result.suggestions) <= 5


def test_missing_configuration_returns_curated_fallback(db_session) -> None:
    result = build_action_suggestions(
        db_session,
        ActionSuggestionRequest(**ACTION_PROFILE),
        make_settings(api_key=None),
    )
    assert result.generation_mode == "curated_fallback"
    assert result.fallback_reason == "not_configured"
    assert result.provider_processing is False
    assert result.model is None


def test_provider_and_safety_failures_fail_closed(db_session) -> None:
    provider_failure = build_action_suggestions(
        db_session,
        ActionSuggestionRequest(**ACTION_PROFILE),
        make_settings(),
        gateway=FakeGateway(fail=True),
    )
    assert provider_failure.generation_mode == "curated_fallback"
    assert provider_failure.fallback_reason == "provider_timeout"

    safety_failure = build_action_suggestions(
        db_session,
        ActionSuggestionRequest(**ACTION_PROFILE),
        make_settings(),
        gateway=FakeGateway(safe=False),
    )
    assert safety_failure.generation_mode == "curated_fallback"
    assert safety_failure.fallback_reason == "safety_rejected"

    deterministic_failure = build_action_suggestions(
        db_session,
        ActionSuggestionRequest(**ACTION_PROFILE),
        make_settings(),
        gateway=FakeGateway(batch=generated_batch(unsafe=True)),
    )
    assert deterministic_failure.generation_mode == "curated_fallback"
    assert deterministic_failure.fallback_reason == "invalid_output"


def test_action_suggestions_do_not_insert_records(db_session) -> None:
    mortality_before = db_session.scalar(select(func.count()).select_from(MortalityRecord))
    context_before = db_session.scalar(select(func.count()).select_from(AllCauseContext))

    build_action_suggestions(
        db_session,
        ActionSuggestionRequest(**ACTION_PROFILE),
        make_settings(api_key=None),
    )

    assert db_session.scalar(select(func.count()).select_from(MortalityRecord)) == mortality_before
    assert db_session.scalar(select(func.count()).select_from(AllCauseContext)) == context_before


def test_action_suggestion_endpoint_validates_input_and_supports_young_profiles(client) -> None:
    invalid = client.post(
        "/api/v1/action-suggestions",
        json={**ACTION_PROFILE, "sleep_quality": "Never sleeps"},
    )
    assert invalid.status_code == 422

    young = client.post(
        "/api/v1/action-suggestions",
        json={**ACTION_PROFILE, "age_group": "10-14"},
    )
    assert young.status_code == 200
    payload = young.json()
    assert payload["generation_mode"] == "curated"
    assert payload["provider_processing"] is False
    assert len(payload["population_context"]) == 5
