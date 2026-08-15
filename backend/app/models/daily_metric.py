"""
BestMe — Daily Metrics Model
==============================
Aggregated daily metrics combining BMR, TDEE, nutrition, and activity.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.types import UUIDColumn


class DailyMetric(Base):
    __tablename__ = "daily_metrics"

    # Composite unique constraint: one row per user per day
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_user_date"),
    )

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUIDColumn,
        primary_key=True,
        default=uuid.uuid4,
    )

    # Foreign key
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDColumn,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Date
    date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )

    # Metabolic calculations
    bmr: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Basal Metabolic Rate (kcal/day)",
    )
    tdee: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Total Daily Energy Expenditure (kcal/day)",
    )
    calorie_target: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Daily calorie target based on goal",
    )

    # Macro *targets* computed by the metabolic engine.
    # Kept separate from the consumed totals below: writing both into the
    # same columns made a body scan wipe out the day's food log.
    target_protein_g: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Daily protein target (g)",
    )
    target_carbs_g: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Daily carbohydrate target (g)",
    )
    target_fat_g: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Daily fat target (g)",
    )

    # Nutrition aggregates *consumed* (summed from meals)
    calories_consumed: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    protein_g: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    carbs_g: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    fat_g: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    fiber_g: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    # Activity aggregates (summed from workouts)
    calories_burned: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    workout_minutes: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    # Optional daily weight check-in
    weight_kg: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── Relationship ──────────────────────────────────────────────
    user = relationship("User", back_populates="daily_metrics")

    def __repr__(self) -> str:
        return f"<DailyMetric {self.date} user={self.user_id}>"
