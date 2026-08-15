"""Separate macro targets from consumed macros in daily_metrics

Before this migration, `protein_g` / `carbs_g` / `fat_g` were written by two
different code paths with two different meanings:

  - meals.py     incremented them with the macros the user *consumed*
  - scans.py     overwrote them with the macros the engine set as *targets*

A body scan therefore erased the day's food log. This adds dedicated
`target_*` columns so the two meanings never share storage again.

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "daily_metrics",
        sa.Column("target_protein_g", sa.Float(), nullable=True, comment="Daily protein target (g)"),
    )
    op.add_column(
        "daily_metrics",
        sa.Column("target_carbs_g", sa.Float(), nullable=True, comment="Daily carbohydrate target (g)"),
    )
    op.add_column(
        "daily_metrics",
        sa.Column("target_fat_g", sa.Float(), nullable=True, comment="Daily fat target (g)"),
    )

    # Repair days that a body scan corrupted.
    #
    # Only those days need fixing: onboarding never wrote macros at all, so a
    # row is only suspect if a scan happened on its date — `body_scans` tells
    # us exactly which. For each such row, move the values sitting in the
    # consumed columns over to the targets (that is what they actually were),
    # then rebuild the consumed totals from `meals`, which was never affected.
    #
    # Dates are compared in UTC to match how the API derives "today"
    # (datetime.now(timezone.utc).date()).
    op.execute(
        """
        UPDATE daily_metrics AS dm
        SET target_protein_g = dm.protein_g,
            target_carbs_g   = dm.carbs_g,
            target_fat_g     = dm.fat_g,
            protein_g = COALESCE((
                SELECT SUM(m.total_protein_g) FROM meals m
                WHERE m.user_id = dm.user_id
                  AND (m.logged_at AT TIME ZONE 'UTC')::date = dm.date
            ), 0),
            carbs_g = COALESCE((
                SELECT SUM(m.total_carbs_g) FROM meals m
                WHERE m.user_id = dm.user_id
                  AND (m.logged_at AT TIME ZONE 'UTC')::date = dm.date
            ), 0),
            fat_g = COALESCE((
                SELECT SUM(m.total_fat_g) FROM meals m
                WHERE m.user_id = dm.user_id
                  AND (m.logged_at AT TIME ZONE 'UTC')::date = dm.date
            ), 0)
        WHERE EXISTS (
            SELECT 1 FROM body_scans bs
            WHERE bs.user_id = dm.user_id
              AND (bs.scanned_at AT TIME ZONE 'UTC')::date = dm.date
        )
        """
    )


def downgrade() -> None:
    op.drop_column("daily_metrics", "target_fat_g")
    op.drop_column("daily_metrics", "target_carbs_g")
    op.drop_column("daily_metrics", "target_protein_g")
