import argparse
import csv
from collections import Counter
from datetime import date
from decimal import Decimal, InvalidOperation
import hashlib
from pathlib import Path

from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from .constants import MALAYSIAN_STATES, MORTALITY_DIMENSIONS
from .database import SessionLocal
from .models import AllCauseContext, DatasetImport, MortalityRecord


EXPECTED_MORTALITY_ROWS = 1935
EXPECTED_DIMENSION_COUNTS = {
    "national_age_group": 95,
    "state_age_group": 1520,
    "state_sex": 320,
}
EXPECTED_ALL_CAUSE_ROWS = 8190
ALL_CAUSE_SEX_CODES = {"both", "male", "female"}
ALL_CAUSE_ETHNICITY_CODES = {
    "overall",
    "bumi_malay",
    "bumi_other",
    "chinese",
    "indian",
    "other_citizen",
    "other_noncitizen",
}


class ImportValidationError(ValueError):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _require_columns(fieldnames: list[str] | None, required: set[str], filename: str) -> None:
    available = set(fieldnames or [])
    missing = sorted(required - available)
    if missing:
        raise ImportValidationError(f"{filename} is missing columns: {', '.join(missing)}")


def _integer(value: str, field: str, row_number: int) -> int:
    try:
        parsed = Decimal(value)
    except InvalidOperation as exc:
        raise ImportValidationError(
            f"Row {row_number}: {field} must be numeric, received {value!r}."
        ) from exc
    if parsed != parsed.to_integral_value():
        raise ImportValidationError(f"Row {row_number}: {field} must be a whole number.")
    return int(parsed)


def load_mortality_csv(path: Path) -> list[dict[str, object]]:
    required = {
        "source_table",
        "dimension_type",
        "year",
        "state",
        "sex",
        "age_group",
        "cause_of_death",
        "rank",
        "death_count",
        "percentage",
        "certification",
    }
    records: list[dict[str, object]] = []
    natural_keys: set[tuple[object, ...]] = set()
    dimensions: Counter[str] = Counter()

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        _require_columns(reader.fieldnames, required, path.name)
        for row_number, row in enumerate(reader, start=2):
            dimension = row["dimension_type"].strip()
            if dimension not in MORTALITY_DIMENSIONS:
                raise ImportValidationError(
                    f"Row {row_number}: unsupported dimension_type {dimension!r}."
                )
            year = _integer(row["year"], "year", row_number)
            death_count = _integer(row["death_count"], "death_count", row_number)
            if death_count < 0:
                raise ImportValidationError(f"Row {row_number}: death_count cannot be negative.")
            rank = _integer(row["rank"], "rank", row_number) if row["rank"].strip() else None
            try:
                percentage = Decimal(row["percentage"]) if row["percentage"].strip() else None
            except InvalidOperation as exc:
                raise ImportValidationError(
                    f"Row {row_number}: percentage must be numeric."
                ) from exc
            if percentage is not None and not (Decimal("0") <= percentage <= Decimal("100")):
                raise ImportValidationError(f"Row {row_number}: percentage is outside 0-100.")
            record = {
                "source_table": row["source_table"].strip(),
                "dimension_type": dimension,
                "year": year,
                "state": row["state"].strip(),
                "sex": row["sex"].strip(),
                "age_group": row["age_group"].strip(),
                "cause_of_death": row["cause_of_death"].strip(),
                "rank": rank,
                "death_count": death_count,
                "percentage": percentage,
                "certification": row["certification"].strip(),
            }
            key = (
                year,
                dimension,
                record["state"],
                record["sex"],
                record["age_group"],
                record["cause_of_death"],
            )
            if key in natural_keys:
                raise ImportValidationError(f"Row {row_number}: duplicate mortality natural key.")
            natural_keys.add(key)
            dimensions[dimension] += 1
            records.append(record)

    if len(records) != EXPECTED_MORTALITY_ROWS:
        raise ImportValidationError(
            f"Expected {EXPECTED_MORTALITY_ROWS} mortality rows, found {len(records)}."
        )
    if dict(dimensions) != EXPECTED_DIMENSION_COUNTS:
        raise ImportValidationError(
            f"Unexpected mortality dimension counts: {dict(dimensions)}."
        )
    return records


def load_all_cause_csv(path: Path) -> list[dict[str, object]]:
    required = {"state", "date", "sex", "ethnicity", "abs"}
    records: list[dict[str, object]] = []
    natural_keys: set[tuple[object, ...]] = set()

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        _require_columns(reader.fieldnames, required, path.name)
        for row_number, row in enumerate(reader, start=2):
            state = row["state"].strip()
            sex = row["sex"].strip()
            ethnicity = row["ethnicity"].strip()
            if state not in MALAYSIAN_STATES:
                raise ImportValidationError(f"Row {row_number}: unsupported state {state!r}.")
            if sex not in ALL_CAUSE_SEX_CODES:
                raise ImportValidationError(f"Row {row_number}: unsupported sex {sex!r}.")
            if ethnicity not in ALL_CAUSE_ETHNICITY_CODES:
                raise ImportValidationError(
                    f"Row {row_number}: unsupported ethnicity {ethnicity!r}."
                )
            try:
                year = date.fromisoformat(row["date"].strip()).year
            except ValueError as exc:
                raise ImportValidationError(
                    f"Row {row_number}: invalid annual date {row['date']!r}."
                ) from exc
            death_count = (
                _integer(row["abs"], "abs", row_number) if row["abs"].strip() else None
            )
            if death_count is not None and death_count < 0:
                raise ImportValidationError(f"Row {row_number}: abs cannot be negative.")
            key = (year, state, sex, ethnicity)
            if key in natural_keys:
                raise ImportValidationError(f"Row {row_number}: duplicate all-cause natural key.")
            natural_keys.add(key)
            records.append(
                {
                    "year": year,
                    "state": state,
                    "sex": sex,
                    "ethnicity": ethnicity,
                    "death_count": death_count,
                }
            )

    if len(records) != EXPECTED_ALL_CAUSE_ROWS:
        raise ImportValidationError(
            f"Expected {EXPECTED_ALL_CAUSE_ROWS} all-cause rows, found {len(records)}."
        )
    return records


def _is_current_import(
    session: Session,
    *,
    dataset_name: str,
    checksum: str,
    model: type[MortalityRecord] | type[AllCauseContext],
    expected_rows: int,
) -> bool:
    latest_checksum = session.scalar(
        select(DatasetImport.source_sha256)
        .where(DatasetImport.dataset_name == dataset_name)
        .order_by(DatasetImport.id.desc())
        .limit(1)
    )
    current_rows = session.scalar(select(func.count()).select_from(model)) or 0
    return latest_checksum == checksum and current_rows == expected_rows


def import_datasets(
    session: Session,
    mortality_path: Path,
    all_cause_path: Path,
) -> dict[str, str]:
    mortality_path = mortality_path.resolve()
    all_cause_path = all_cause_path.resolve()
    mortality_records = load_mortality_csv(mortality_path)
    all_cause_records = load_all_cause_csv(all_cause_path)
    mortality_checksum = _sha256(mortality_path)
    all_cause_checksum = _sha256(all_cause_path)
    result: dict[str, str] = {}

    if _is_current_import(
        session,
        dataset_name="mortality_record",
        checksum=mortality_checksum,
        model=MortalityRecord,
        expected_rows=len(mortality_records),
    ):
        result["mortality_record"] = "unchanged"
    else:
        session.execute(delete(MortalityRecord))
        session.execute(insert(MortalityRecord), mortality_records)
        session.add(
            DatasetImport(
                dataset_name="mortality_record",
                source_filename=mortality_path.name,
                source_sha256=mortality_checksum,
                row_count=len(mortality_records),
            )
        )
        result["mortality_record"] = f"imported {len(mortality_records)} rows"

    if _is_current_import(
        session,
        dataset_name="all_cause_context",
        checksum=all_cause_checksum,
        model=AllCauseContext,
        expected_rows=len(all_cause_records),
    ):
        result["all_cause_context"] = "unchanged"
    else:
        session.execute(delete(AllCauseContext))
        session.execute(insert(AllCauseContext), all_cause_records)
        session.add(
            DatasetImport(
                dataset_name="all_cause_context",
                source_filename=all_cause_path.name,
                source_sha256=all_cause_checksum,
                row_count=len(all_cause_records),
            )
        )
        result["all_cause_context"] = f"imported {len(all_cause_records)} rows"

    return result


def main() -> None:
    workspace = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser(description="Import validated WiseAge datasets.")
    parser.add_argument(
        "--mortality-csv",
        type=Path,
        default=workspace / "mvp_causes_of_death_extracted.csv",
    )
    parser.add_argument(
        "--all-cause-csv",
        type=Path,
        default=workspace / "death_sex_ethnic_state.csv",
    )
    args = parser.parse_args()

    with SessionLocal.begin() as session:
        result = import_datasets(session, args.mortality_csv, args.all_cause_csv)
    for dataset, outcome in result.items():
        print(f"{dataset}: {outcome}")


if __name__ == "__main__":
    main()
