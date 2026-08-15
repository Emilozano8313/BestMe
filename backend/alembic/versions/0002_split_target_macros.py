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

    # Rows written by a body scan hold targets in the consumed columns.
    # They are indistinguishable from real intake, so move them across and
    # reset the consumed totals to zero — the meals for that day can be
    # re-aggregated from the `meals` table, which was never corrupted.
    op.execute(
        """
        UPDATE daily_metrics AS dm
        SET target_protein_g = dm.protein_g,
            target_carbs_g   = dm.carbs_g,
            target_fat_g     = dm.fat_g,
            protein_g        = COALESCE(m.protein, 0),
            carbs_g          = COALESCE(m.carbs, 0),
            fat_g            = COALESCE(m.fat, 0)
        FROM (
            SELECT user_id,
                   DATE(logged_at) AS day,
                   SUM(total_protein_g) AS protein,
                   SUM(total_carbs_g)   AS carbs,
                   SUM(total_fat_g)     AS fat
            FROM meals
            GROUP BY user_id, DATE(logged_at)
        ) AS m
        ON m.user_id = dm.user_id AND m.day = dm.date
        WHERE dm.calorie_target IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("daily_metrics", "target_fat_g")
    op.drop_column("daily_metrics", "target_carbs_g")
    op.drop_column("daily_metrics", "target_protein_g")
