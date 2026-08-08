from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class MortalityRecord(Base):
    __tablename__ = "mortality_record"
    __table_args__ = (
        UniqueConstraint(
            "year",
            "dimension_type",
            "state",
            "sex",
            "age_group",
            "cause_of_death",
            name="uq_mortality_natural_key",
        ),
        CheckConstraint("death_count >= 0", name="ck_mortality_death_count_nonnegative"),
        CheckConstraint(
            "percentage IS NULL OR (percentage >= 0 AND percentage <= 100)",
            name="ck_mortality_percentage_range",
        ),
        CheckConstraint(
            "dimension_type IN ('national_age_group', 'state_age_group', 'state_sex')",
            name="ck_mortality_dimension_type",
        ),
        Index(
            "ix_mortality_state_age_lookup",
            "year",
            "dimension_type",
            "state",
            "age_group",
        ),
        Index(
            "ix_mortality_cause_comparison",
            "year",
            "dimension_type",
            "cause_of_death",
            "state",
            "age_group",
            "sex",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_table: Mapped[str] = mapped_column(String(16), nullable=False)
    dimension_type: Mapped[str] = mapped_column(String(32), nullable=False)
    year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    state: Mapped[str] = mapped_column(String(64), nullable=False)
    sex: Mapped[str] = mapped_column(String(16), nullable=False)
    age_group: Mapped[str] = mapped_column(String(64), nullable=False)
    cause_of_death: Mapped[str] = mapped_column(String(255), nullable=False)
    rank: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    death_count: Mapped[int] = mapped_column(Integer, nullable=False)
    percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    certification: Mapped[str] = mapped_column(String(64), nullable=False)


class AllCauseContext(Base):
    __tablename__ = "all_cause_context"
    __table_args__ = (
        UniqueConstraint(
            "year",
            "state",
            "sex",
            "ethnicity",
            name="uq_all_cause_natural_key",
        ),
        CheckConstraint(
            "death_count IS NULL OR death_count >= 0",
            name="ck_all_cause_death_count_nonnegative",
        ),
        Index(
            "ix_all_cause_profile_lookup",
            "year",
            "state",
            "sex",
            "ethnicity",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    state: Mapped[str] = mapped_column(String(64), nullable=False)
    sex: Mapped[str] = mapped_column(String(16), nullable=False)
    ethnicity: Mapped[str] = mapped_column(String(32), nullable=False)
    death_count: Mapped[int | None] = mapped_column(Integer, nullable=True)


class DatasetImport(Base):
    __tablename__ = "dataset_import"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_name: Mapped[str] = mapped_column(String(64), nullable=False)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
