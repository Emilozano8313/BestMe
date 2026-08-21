"""Add distance_km to workout_sessions

Supports GPS-tracked routes (caminar/correr/ciclismo): distance covered in
kilometres, alongside the existing duration_seconds. Null for set-based
strength sessions, which have no distance.

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workout_sessions",
        sa.Column("distance_km", sa.Float(), nullable=True, comment="Distance covered, in km (GPS-tracked routes)"),
    )


def downgrade() -> None:
    op.drop_column("workout_sessions", "distance_km")
