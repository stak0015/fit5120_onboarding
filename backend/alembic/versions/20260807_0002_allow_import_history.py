"""Allow repeated source checksums in import history.

Revision ID: 20260807_0002
Revises: 20260807_0001
Create Date: 2026-08-07
"""
from collections.abc import Sequence

from alembic import op


revision: str = "20260807_0002"
down_revision: str | None = "20260807_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "uq_dataset_import_name_checksum",
        "dataset_import",
        type_="unique",
    )


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_dataset_import_name_checksum",
        "dataset_import",
        ["dataset_name", "source_sha256"],
    )

