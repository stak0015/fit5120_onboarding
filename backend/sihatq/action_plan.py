import json
import logging
import re
from time import perf_counter
from typing import Protocol
from uuid import uuid4

from sqlalchemy.orm import Session

from .config import Settings
from .schemas import (
    ActionSuggestion,
    ActionSuggestionRequest,
    ActionSuggestionResponse,
    GeneratedActionBatch,
    GeneratedActionSuggestion,
    InsightRequest,
    PopulationContextItem,
)
from .service import build_cause_stats, get_primary_mortality_match


logger = logging.getLogger(__name__)


class SuggestionOutputError(ValueError):
    pass


class SuggestionSafetyError(ValueError):
    pass

ACTION_DISCLAIMER = (
    "These are general wellness suggestions, not a diagnosis, treatment plan, "
    "or personal risk assessment. Consult a qualified healthcare professional "
    "for advice about your circumstances."
)
UNDER_20_AGE_GROUPS = {"0", "1-4", "5-9", "10-14", "15-19"}
ALLOWED_CATEGORIES = [
    "movement",
    "nutrition",
    "smoking",
    "alcohol",
    "sleep",
    "stress",
    "preventive_care",
]
ALLOWED_LIFESTYLE_BASIS = [
    "activity",
    "smoking",
    "alcohol",
    "diet",
    "family_history",
    "sleep_quality",
    "stress_level",
]
PROHIBITED_OUTPUT_PATTERNS = (
    re.compile(r"\byou (?:have|will develop|are likely to develop)\b", re.I),
    re.compile(r"\byour (?:personal )?risk (?:is|of)\b", re.I),
    re.compile(r"\b(?:diagnose|diagnosis|cure|treat your)\b", re.I),
    re.compile(r"\b(?:start|stop|increase|decrease|change) (?:taking )?(?:your )?(?:medication|dose)\b", re.I),
    re.compile(r"\b(?:intermittent fasting|fast for \d+|extreme diet)\b", re.I),
    re.compile(r"\bguarantee(?:d|s)?\b", re.I),
    re.compile(r"\d+(?:\.\d+)?\s*%"),
    re.compile(r"https?://", re.I),
)

GROQ_RESPONSE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "suggestions": {
            "type": "array",
            "minItems": 3,
            "maxItems": 5,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "category": {"type": "string", "enum": ALLOWED_CATEGORIES},
                    "priority": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                    },
                    "title": {"type": "string"},
                    "action": {"type": "string"},
                    "target": {"type": "string"},
                    "timeframe_weeks": {"type": "integer"},
                    "rationale": {"type": "string"},
                    "lifestyle_basis": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ALLOWED_LIFESTYLE_BASIS,
                        },
                    },
                    "population_basis": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "professional_support_note": {
                        "type": ["string", "null"]
                    },
                },
                "required": [
                    "category",
                    "priority",
                    "title",
                    "action",
                    "target",
                    "timeframe_weeks",
                    "rationale",
                    "lifestyle_basis",
                    "population_basis",
                    "professional_support_note",
                ],
            },
        }
    },
    "required": ["suggestions"],
}

SYSTEM_PROMPT = """You create optional, general preventive-wellness actions.
The supplied mortality causes are recorded counts for a population comparison group.
They are not the user's diagnoses, probabilities, or measured personal risks.

Return 3 to 5 practical, low-burden suggestions using the required JSON schema.
Personalise primarily from the supplied living-habit answers. Population causes may
only provide educational context. Never claim that the user has, will develop, or is
personally at risk of a disease. Never diagnose, prescribe treatment, recommend
medication or supplement changes, recommend fasting or extreme diets, give unsupported
quantified benefit claims, or provide age-inappropriate advice. Do not include URLs.
Use professional_support_note when smoking, frequent alcohol use, family history, or
another answer makes a conversation with a qualified professional appropriate.
Every population_basis entry must exactly match one of the supplied cause names.
"""

SAFETY_POLICY = """Classify the proposed wellness suggestions as SAFE or UNSAFE.
UNSAFE includes diagnosis, personal disease probability, medication or supplement
changes, treatment instructions, extreme restriction or fasting, unsupported numeric
benefit claims, age-inappropriate advice, or presenting population mortality counts as
the individual's condition. General movement, sleep, nutrition, stress-management,
smoking-cessation support, and preventive-care suggestions are SAFE when cautiously
worded. End with exactly one line: DECISION: SAFE or DECISION: UNSAFE.
"""


class SuggestionGateway(Protocol):
    model: str

    def generate(
        self,
        request: ActionSuggestionRequest,
        comparison_group: str,
        population_context: list[PopulationContextItem],
    ) -> GeneratedActionBatch: ...

    def is_safe(self, batch: GeneratedActionBatch) -> bool: ...


class GroqSuggestionGateway:
    def __init__(self, settings: Settings) -> None:
        from groq import Groq

        self.model = settings.groq_model
        self.safety_model = settings.groq_safety_model
        self.client = Groq(
            api_key=settings.groq_api_key,
            timeout=settings.groq_timeout_seconds,
            max_retries=1,
        )

    def generate(
        self,
        request: ActionSuggestionRequest,
        comparison_group: str,
        population_context: list[PopulationContextItem],
    ) -> GeneratedActionBatch:
        provider_payload = {
            "age_group": request.age_group,
            "living_habits": {
                "activity": request.activity,
                "smoking": request.smoking,
                "alcohol": request.alcohol,
                "diet": request.diet,
                "family_history": request.family_history,
                "sleep_quality": request.sleep_quality,
                "stress_level": request.stress_level,
            },
            "comparison_group": comparison_group,
            "population_context": [item.model_dump() for item in population_context],
            "population_context_limitations": [
                "These are selected medically certified cause counts, not all causes.",
                "Counts are not population-adjusted rates.",
                "The values do not estimate this user's personal risk.",
            ],
        }
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(provider_payload, ensure_ascii=False),
                },
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "wiseage_action_suggestions",
                    "strict": True,
                    "schema": GROQ_RESPONSE_SCHEMA,
                },
            },
            temperature=0.2,
            max_completion_tokens=1800,
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError("Groq returned an empty or refused response.")
        return GeneratedActionBatch.model_validate_json(content)

    def is_safe(self, batch: GeneratedActionBatch) -> bool:
        response = self.client.chat.completions.create(
            model=self.safety_model,
            messages=[
                {"role": "system", "content": SAFETY_POLICY},
                {
                    "role": "user",
                    "content": batch.model_dump_json(),
                },
            ],
            temperature=0.1,
            max_completion_tokens=500,
        )
        content = response.choices[0].message.content or ""
        decisions = re.findall(r"DECISION:\s*(SAFE|UNSAFE)", content, re.I)
        return bool(decisions) and decisions[-1].upper() == "SAFE"


def _suggestion(
    *,
    category: str,
    priority: str,
    title: str,
    action: str,
    target: str,
    timeframe_weeks: int,
    rationale: str,
    lifestyle_basis: list[str],
    support_note: str | None = None,
) -> GeneratedActionSuggestion:
    return GeneratedActionSuggestion(
        category=category,
        priority=priority,
        title=title,
        action=action,
        target=target,
        timeframe_weeks=timeframe_weeks,
        rationale=rationale,
        lifestyle_basis=lifestyle_basis,
        population_basis=[],
        professional_support_note=support_note,
    )


def _curated_suggestions(
    request: ActionSuggestionRequest,
    *,
    is_under_20: bool,
) -> GeneratedActionBatch:
    suggestions: list[GeneratedActionSuggestion] = []

    if request.smoking == "Current smoker":
        suggestions.append(
            _suggestion(
                category="smoking",
                priority="high",
                title="Ask for smoking-cessation support",
                action=(
                    "Speak with a trusted adult and qualified healthcare professional "
                    "about safe support for stopping smoking."
                    if is_under_20
                    else "Arrange a conversation with a qualified healthcare professional about evidence-based support for stopping smoking."
                ),
                target="Arrange one support conversation",
                timeframe_weeks=2,
                rationale="You selected current smoker, so professional cessation support is a practical first step.",
                lifestyle_basis=["smoking"],
                support_note="A qualified professional can help choose support suited to the individual.",
            )
        )

    if request.alcohol == "Frequently":
        suggestions.append(
            _suggestion(
                category="alcohol",
                priority="high",
                title="Discuss alcohol use with someone qualified",
                action=(
                    "Talk with a trusted adult or qualified healthcare professional about alcohol use and appropriate support."
                    if is_under_20
                    else "Discuss your alcohol pattern with a qualified healthcare professional before making major changes."
                ),
                target="Arrange one confidential conversation",
                timeframe_weeks=2,
                rationale="You selected frequent alcohol use, which is best addressed with individual professional guidance.",
                lifestyle_basis=["alcohol"],
                support_note="Seek urgent medical help if reducing alcohol causes severe symptoms.",
            )
        )

    if request.activity in {"Rarely", "Sometimes"}:
        suggestions.append(
            _suggestion(
                category="movement",
                priority="medium",
                title="Build a manageable movement routine",
                action=(
                    "Choose an enjoyable, age-appropriate activity with a parent or caregiver and do it on three days each week."
                    if is_under_20
                    else "Choose a comfortable activity such as walking and schedule it on three days each week."
                ),
                target="Move on 3 days each week",
                timeframe_weeks=4,
                rationale="This responds to the physical-activity level selected in the profile.",
                lifestyle_basis=["activity"],
            )
        )

    if request.sleep_quality in {"Poor", "Fair"}:
        suggestions.append(
            _suggestion(
                category="sleep",
                priority="medium",
                title="Create a steadier sleep routine",
                action="Choose a consistent wind-down time and reduce stimulating screen use before bed on most nights.",
                target="Follow the routine on 5 nights each week",
                timeframe_weeks=4,
                rationale="You selected poor or fair sleep quality, so a repeatable routine is a low-burden starting point.",
                lifestyle_basis=["sleep_quality"],
            )
        )

    if request.stress_level in {"Moderate", "High"}:
        suggestions.append(
            _suggestion(
                category="stress",
                priority="medium",
                title="Schedule a short daily reset",
                action=(
                    "Choose ten quiet minutes for breathing, stretching, or talking with a trusted adult."
                    if is_under_20
                    else "Choose ten quiet minutes for slow breathing, stretching, or a short outdoor break."
                ),
                target="Take a 10-minute reset on 5 days each week",
                timeframe_weeks=3,
                rationale="This responds to the stress level selected in the profile without treating it as a diagnosis.",
                lifestyle_basis=["stress_level"],
                support_note=(
                    "Speak with a trusted adult or qualified professional if stress feels unmanageable."
                    if request.stress_level == "High"
                    else None
                ),
            )
        )

    if request.diet in {"Mixed", "Often highly processed"}:
        suggestions.append(
            _suggestion(
                category="nutrition",
                priority="medium",
                title="Improve one regular meal",
                action="Choose one regular meal and add a fruit or vegetable while reducing one highly processed item.",
                target="Improve one meal on 5 days each week",
                timeframe_weeks=4,
                rationale="This is a small, practical response to the dietary pattern selected in the profile.",
                lifestyle_basis=["diet"],
            )
        )

    defaults = [
        _suggestion(
            category="preventive_care",
            priority="low",
            title="Prepare for a preventive-health conversation",
            action=(
                "Write down one health question to discuss with a parent, caregiver, or qualified healthcare professional."
                if is_under_20
                else "Write down one health question to raise at your next routine healthcare visit."
            ),
            target="Prepare 1 question",
            timeframe_weeks=4,
            rationale="A prepared question can make routine preventive-health conversations more useful.",
            lifestyle_basis=["family_history"],
        ),
        _suggestion(
            category="movement",
            priority="low",
            title="Break up long periods of sitting",
            action="Stand, stretch, or walk briefly during two natural breaks in the day.",
            target="Take 2 movement breaks each day",
            timeframe_weeks=3,
            rationale="Brief movement breaks are a practical general-wellness habit.",
            lifestyle_basis=["activity"],
        ),
        _suggestion(
            category="stress",
            priority="low",
            title="Protect one restorative activity",
            action="Set aside time each week for an enjoyable offline activity with supportive people.",
            target="Complete 1 restorative activity each week",
            timeframe_weeks=4,
            rationale="A regular restorative activity supports general wellbeing.",
            lifestyle_basis=["stress_level"],
        ),
    ]
    existing_titles = {item.title.casefold() for item in suggestions}
    for item in defaults:
        if len(suggestions) >= 3:
            break
        if item.title.casefold() not in existing_titles:
            suggestions.append(item)
            existing_titles.add(item.title.casefold())

    priority_order = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda item: priority_order[item.priority])
    return GeneratedActionBatch(suggestions=suggestions[:5])


def _validate_generated_batch(
    batch: GeneratedActionBatch,
    population_context: list[PopulationContextItem],
) -> None:
    known_causes = {item.cause_of_death for item in population_context}
    seen_titles: set[str] = set()
    seen_actions: set[str] = set()
    for suggestion in batch.suggestions:
        if not set(suggestion.population_basis).issubset(known_causes):
            raise SuggestionOutputError("Suggestion referenced an unknown population cause.")
        title_key = suggestion.title.strip().casefold()
        action_key = suggestion.action.strip().casefold()
        if title_key in seen_titles or action_key in seen_actions:
            raise SuggestionOutputError("Suggestion batch contains duplicate actions.")
        seen_titles.add(title_key)
        seen_actions.add(action_key)
        text = " ".join(
            filter(
                None,
                [
                    suggestion.title,
                    suggestion.action,
                    suggestion.target,
                    suggestion.rationale,
                    suggestion.professional_support_note,
                ],
            )
        )
        if any(pattern.search(text) for pattern in PROHIBITED_OUTPUT_PATTERNS):
            raise SuggestionOutputError("Suggestion batch failed deterministic safety validation.")


def _fallback_details(exc: Exception) -> tuple[str, str]:
    exception_name = type(exc).__name__
    if isinstance(exc, SuggestionSafetyError):
        return (
            "safety_rejected",
            "Reviewed suggestions are shown because the AI output did not pass the required safety review.",
        )
    if isinstance(exc, SuggestionOutputError) or exception_name in {
        "ValidationError",
        "JSONDecodeError",
    }:
        return (
            "invalid_output",
            "Reviewed suggestions are shown because the AI response did not match the required safe format.",
        )
    if exception_name in {"APIConnectionError", "ConnectError"}:
        return (
            "provider_connection",
            "Reviewed suggestions are shown because the API could not connect to Groq. Check the backend network connection and try again.",
        )
    if exception_name in {"APITimeoutError", "TimeoutError", "ReadTimeout"}:
        return (
            "provider_timeout",
            "Reviewed suggestions are shown because Groq took too long to respond. Please try again.",
        )
    if exception_name == "RateLimitError":
        return (
            "provider_rate_limited",
            "Reviewed suggestions are shown because the Groq request limit was reached. Please try again later.",
        )
    if exception_name in {"BadRequestError", "UnprocessableEntityError"}:
        return (
            "provider_rejected_request",
            "Reviewed suggestions are shown because Groq rejected the generation request. Check the configured model and provider settings.",
        )
    return (
        "unexpected_error",
        "Reviewed suggestions are shown because AI-assisted suggestions were temporarily unavailable.",
    )


def _public_suggestions(
    batch: GeneratedActionBatch,
) -> list[ActionSuggestion]:
    return [
        ActionSuggestion(suggestion_id=str(uuid4()), **suggestion.model_dump())
        for suggestion in batch.suggestions
    ]


def build_action_suggestions(
    session: Session,
    request: ActionSuggestionRequest,
    settings: Settings,
    *,
    gateway: SuggestionGateway | None = None,
) -> ActionSuggestionResponse:
    started = perf_counter()
    request_id = str(uuid4())
    insight_request = InsightRequest(
        year=request.year,
        age_group=request.age_group,
        state=request.state,
        sex=request.sex,
        ethnicity=request.ethnicity,
    )
    match = get_primary_mortality_match(session, insight_request)
    population_context = [
        PopulationContextItem(
            cause_of_death=cause.cause_of_death,
            death_count=cause.death_count,
        )
        for cause in build_cause_stats(match.records)
    ]
    is_under_20 = request.age_group in UNDER_20_AGE_GROUPS
    attempted_provider = False
    error_category = "none"

    if is_under_20:
        mode = "curated"
        fallback_reason = None
        model = None
        batch = _curated_suggestions(request, is_under_20=True)
        notice = (
            "Reviewed age-appropriate suggestions are shown for profiles below age 20; "
            "this profile was not sent to an external AI provider."
        )
    elif not settings.action_suggestions_enabled or not settings.groq_api_key:
        mode = "curated_fallback"
        fallback_reason = "not_configured"
        model = None
        batch = _curated_suggestions(request, is_under_20=False)
        notice = (
            "Reviewed suggestions are shown because AI-assisted suggestions are not "
            "configured for this environment."
        )
    else:
        attempted_provider = True
        fallback_reason = None
        model = settings.groq_model
        try:
            active_gateway = gateway or GroqSuggestionGateway(settings)
            batch = active_gateway.generate(
                request,
                match.comparison_group,
                population_context,
            )
            _validate_generated_batch(batch, population_context)
            if not active_gateway.is_safe(batch):
                raise SuggestionSafetyError("Safety review rejected the generated suggestions.")
            mode = "ai"
            notice = (
                "AI-assisted suggestions were generated from living habits and clearly "
                "labelled population context, then checked before display."
            )
        except Exception as exc:  # Provider and safety failures must fail closed.
            error_category = type(exc).__name__
            mode = "curated_fallback"
            fallback_reason, notice = _fallback_details(exc)
            model = None
            batch = _curated_suggestions(request, is_under_20=False)
            logger.warning(
                "action_suggestions_fallback request_id=%s reason=%s error_category=%s",
                request_id,
                fallback_reason,
                error_category,
            )

    response = ActionSuggestionResponse(
        request_id=request_id,
        generation_mode=mode,
        fallback_reason=fallback_reason,
        model=model,
        provider_processing=attempted_provider,
        comparison_group=match.comparison_group,
        population_context=population_context,
        suggestions=_public_suggestions(batch),
        notice=notice,
        disclaimer=ACTION_DISCLAIMER,
    )
    logger.info(
        "action_suggestions request_id=%s mode=%s model=%s latency_ms=%d "
        "suggestion_count=%d error_category=%s",
        request_id,
        mode,
        model or "none",
        round((perf_counter() - started) * 1000),
        len(response.suggestions),
        error_category,
    )
    return response
