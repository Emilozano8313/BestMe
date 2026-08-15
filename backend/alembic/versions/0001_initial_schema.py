"""Initial schema - all core tables

Revision ID: 0001
Revises: 
Create Date: 2026-08-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Users table ───────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column(
            "gender",
            sa.Enum("male", "female", "other", name="gender_enum"),
            nullable=True,
        ),
        sa.Column("height_cm", sa.Float(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("body_fat_percentage", sa.Float(), nullable=True),
        sa.Column(
            "activity_level",
            sa.Enum(
                "sedentary", "light", "moderate", "active", "very_active",
                name="activity_level_enum",
            ),
            nullable=True,
            server_default="moderate",
        ),
        sa.Column(
            "goal",
            sa.Enum("lose_weight", "maintain", "gain_muscle", name="fitness_goal_enum"),
            nullable=True,
            server_default="maintain",
        ),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ── Meals table ───────────────────────────────────────────────
    op.create_table(
        "meals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "meal_type",
            sa.Enum("breakfast", "lunch", "dinner", "snack", name="meal_type_enum"),
            nullable=False,
        ),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("photo_url", sa.Text(), nullable=True),
        sa.Column("detected_foods", postgresql.JSONB(), nullable=True),
        sa.Column("total_calories", sa.Float(), default=0.0, nullable=False),
        sa.Column("total_protein_g", sa.Float(), default=0.0, nullable=False),
        sa.Column("total_carbs_g", sa.Float(), default=0.0, nullable=False),
        sa.Column("total_fat_g", sa.Float(), default=0.0, nullable=False),
        sa.Column("total_fiber_g", sa.Float(), default=0.0, nullable=False),
        sa.Column("manually_adjusted", sa.Boolean(), default=False, nullable=False),
        sa.Column(
            "logged_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ── Body Scans table ──────────────────────────────────────────
    op.create_table(
        "body_scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("photo_url", sa.Text(), nullable=False),
        sa.Column("estimated_body_fat", sa.Float(), nullable=False),
        sa.Column(
            "confidence_score",
            sa.Float(),
            nullable=False,
            comment="0.0 to 1.0 confidence in the estimation",
        ),
        sa.Column("scan_metadata", postgresql.JSONB(), nullable=True),
        sa.Column("weight_at_scan_kg", sa.Float(), nullable=True),
        sa.Column(
            "scanned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ── Workout Sessions table ────────────────────────────────────
    op.create_table(
        "workout_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("exercise_name", sa.String(100), nullable=False, index=True),
        sa.Column("sets", postgresql.JSONB(), nullable=True),
        sa.Column("total_sets", sa.Integer(), default=0, nullable=False),
        sa.Column("total_reps", sa.Integer(), default=0, nullable=False),
        sa.Column(
            "avg_form_score",
            sa.Float(),
            nullable=True,
            comment="Average form quality score 0.0-1.0",
        ),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("calories_burned", sa.Float(), nullable=True),
        sa.Column("analysis_summary", postgresql.JSONB(), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ── Daily Metrics table ───────────────────────────────────────
    op.create_table(
        "daily_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("date", sa.Date(), nullable=False, index=True),
        sa.Column("bmr", sa.Float(), nullable=True, comment="Basal Metabolic Rate"),
        sa.Column("tdee", sa.Float(), nullable=True, comment="Total Daily Energy Expenditure"),
        sa.Column("calorie_target", sa.Float(), nullable=True),
        sa.Column("calories_consumed", sa.Float(), default=0.0, nullable=False),
        sa.Column("protein_g", sa.Float(), default=0.0, nullable=False),
        sa.Column("carbs_g", sa.Float(), default=0.0, nullable=False),
        sa.Column("fat_g", sa.Float(), default=0.0, nullable=False),
        sa.Column("fiber_g", sa.Float(), default=0.0, nullable=False),
        sa.Column("calories_burned", sa.Float(), default=0.0, nullable=False),
        sa.Column("workout_minutes", sa.Float(), default=0.0, nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "date", name="uq_user_date"),
    )


def downgrade() -> None:
    op.drop_table("daily_metrics")
    op.drop_table("workout_sessions")
    op.drop_table("body_scans")
    op.drop_table("meals")
    op.drop_table("users")

    # Drop enums
    op.execute("DROP TYPE IF EXISTS gender_enum")
    op.execute("DROP TYPE IF EXISTS activity_level_enum")
    op.execute("DROP TYPE IF EXISTS fitness_goal_enum")
    op.execute("DROP TYPE IF EXISTS meal_type_enum")
