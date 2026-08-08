from pathlib import Path

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from sihatq.importer import import_datasets, load_all_cause_csv, load_mortality_csv
from sihatq.models import AllCauseContext, Base, DatasetImport, MortalityRecord


WORKSPACE = Path(__file__).resolve().parents[3]
MORTALITY_CSV = WORKSPACE / "mvp_causes_of_death_extracted.csv"
ALL_CAUSE_CSV = WORKSPACE / "death_sex_ethnic_state.csv"


def test_source_files_reconcile_expected_rows() -> None:
    mortality = load_mortality_csv(MORTALITY_CSV)
    all_cause = load_all_cause_csv(ALL_CAUSE_CSV)
    assert len(mortality) == 1935
    assert len(all_cause) == 8190
    assert sum(row["percentage"] is None for row in mortality) == 357
    assert sum(row["death_count"] is None for row in all_cause) == 192


def test_import_is_idempotent() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        first = import_datasets(session, MORTALITY_CSV, ALL_CAUSE_CSV)
        session.commit()
        second = import_datasets(session, MORTALITY_CSV, ALL_CAUSE_CSV)
        session.commit()

        assert first == {
            "mortality_record": "imported 1935 rows",
            "all_cause_context": "imported 8190 rows",
        }
        assert second == {
            "mortality_record": "unchanged",
            "all_cause_context": "unchanged",
        }
        assert session.scalar(select(func.count()).select_from(MortalityRecord)) == 1935
        assert session.scalar(select(func.count()).select_from(AllCauseContext)) == 8190
        assert session.scalar(select(func.count()).select_from(DatasetImport)) == 2
    engine.dispose()

