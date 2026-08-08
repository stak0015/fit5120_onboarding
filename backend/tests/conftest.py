from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from sihatq.database import get_session
from sihatq.importer import load_all_cause_csv, load_mortality_csv
from sihatq.main import app
from sihatq.models import AllCauseContext, Base, MortalityRecord


WORKSPACE = Path(__file__).resolve().parents[3]
MORTALITY_CSV = WORKSPACE / "mvp_causes_of_death_extracted.csv"
ALL_CAUSE_CSV = WORKSPACE / "death_sex_ethnic_state.csv"


@pytest.fixture(scope="session")
def test_engine():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.execute(insert(MortalityRecord), load_mortality_csv(MORTALITY_CSV))
        session.execute(insert(AllCauseContext), load_all_cause_csv(ALL_CAUSE_CSV))
        session.commit()
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(test_engine) -> Generator[Session, None, None]:
    with Session(test_engine) as session:
        yield session


@pytest.fixture()
def client(test_engine) -> Generator[TestClient, None, None]:
    TestingSession = sessionmaker(bind=test_engine, class_=Session, expire_on_commit=False)

    def override_session() -> Generator[Session, None, None]:
        with TestingSession() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

