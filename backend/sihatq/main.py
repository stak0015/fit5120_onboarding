from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_session
from .schemas import HealthResponse, InsightRequest, InsightsResponse, MetadataResponse
from .service import build_insights, build_metadata


settings = get_settings()
app = FastAPI(
    title="WiseAge Health Mortality Insights API",
    version="1.0.0",
    description="Population-level Malaysian mortality context for the WiseAge Health MVP.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/health", response_model=HealthResponse)
def health(session: Session = Depends(get_session)) -> HealthResponse:
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is unavailable.",
        ) from exc
    return HealthResponse(
        status="ok",
        database="connected",
        environment=settings.environment,
    )


@app.get("/api/v1/metadata", response_model=MetadataResponse)
def metadata(session: Session = Depends(get_session)) -> MetadataResponse:
    return build_metadata(session)


@app.post("/api/v1/insights", response_model=InsightsResponse)
def insights(
    request: InsightRequest,
    session: Session = Depends(get_session),
) -> InsightsResponse:
    try:
        return build_insights(session, request)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

