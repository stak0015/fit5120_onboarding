"""Create mortality insight tables.

Revision ID: 20260807_0001
Revises:
Create Date: 2026-08-07
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260807_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mortality_record",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source_table", sa.String(length=16), nullable=False),
        sa.Column("dimension_type", sa.String(length=32), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=False),
        sa.Column("state", sa.String(length=64), nullable=False),
        sa.Column("sex", sa.String(length=16), nullable=False),
        sa.Column("age_group", sa.String(length=64), nullable=False),
        sa.Column("cause_of_death", sa.String(length=255), nullable=False),
        sa.Column("rank", sa.SmallInteger(), nullable=True),
        sa.Column("death_count", sa.Integer(), nullable=False),
        sa.Column("percentage", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("certification", sa.String(length=64), nullable=False),
        sa.CheckConstraint(
            "death_count >= 0",
            name="ck_mortality_death_count_nonnegative",
        ),
        sa.CheckConstraint(
            "dimension_type IN ('national_age_group', 'state_age_group', 'state_sex')",
            name="ck_mortality_dimension_type",
        ),
        sa.CheckConstraint(
            "percentage IS NULL OR (percentage >= 0 AND percentage <= 100)",
            name="ck_mortality_percentage_range",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "year",
            "dimension_type",
            "state",
            "sex",
            "age_group",
            "cause_of_death",
            name="uq_mortality_natural_key",
        ),
    )
    op.create_index(
        "ix_mortality_state_age_lookup",
        "mortality_record",
        ["year", "dimension_type", "state", "age_group"],
    )
    op.create_index(
        "ix_mortality_cause_comparison",
        "mortality_record",
        ["year", "dimension_type", "cause_of_death", "state", "age_group", "sex"],
    )

    op.create_table(
        "all_cause_context",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=False),
        sa.Column("state", sa.String(length=64), nullable=False),
        sa.Column("sex", sa.String(length=16), nullable=False),
        sa.Column("ethnicity", sa.String(length=32), nullable=False),
        sa.Column("death_count", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "death_count IS NULL OR death_count >= 0",
            name="ck_all_cause_death_count_nonnegative",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "year",
            "state",
            "sex",
            "ethnicity",
            name="uq_all_cause_natural_key",
        ),
    )
    op.create_index(
        "ix_all_cause_profile_lookup",
        "all_cause_context",
        ["year", "state", "sex", "ethnicity"],
    )

    op.create_table(
        "dataset_import",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dataset_name", sa.String(length=64), nullable=False),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("source_sha256", sa.String(length=64), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column(
            "imported_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "dataset_name",
            "source_sha256",
            name="uq_dataset_import_name_checksum",
        ),
    )


def downgrade() -> None:
    op.drop_table("dataset_import")
    op.drop_index("ix_all_cause_profile_lookup", table_name="all_cause_context")
    op.drop_table("all_cause_context")
    op.drop_index("ix_mortality_cause_comparison", table_name="mortality_record")
    op.drop_index("ix_mortality_state_age_lookup", table_name="mortality_record")
    op.drop_table("mortality_record")

