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
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DailyMetric(Base):
    __tablename__ = "daily_metrics"

    # Composite unique constraint: one row per user per day
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_user_date"),
    )

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Foreign key
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
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

    # Nutrition aggregates (summed from meals)
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
