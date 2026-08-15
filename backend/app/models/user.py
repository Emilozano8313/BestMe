"""
BestMe — User Model
=====================
Core user table with anthropometric data and fitness goals.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.types import UUIDColumn, enum_values


# ── Enums ─────────────────────────────────────────────────────────
class Gender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class ActivityLevel(str, enum.Enum):
    SEDENTARY = "sedentary"
    LIGHT = "light"
    MODERATE = "moderate"
    ACTIVE = "active"
    VERY_ACTIVE = "very_active"


class FitnessGoal(str, enum.Enum):
    LOSE_WEIGHT = "lose_weight"
    MAINTAIN = "maintain"
    GAIN_MUSCLE = "gain_muscle"


# ── User Model ────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUIDColumn,
        primary_key=True,
        default=uuid.uuid4,
    )

    # Authentication
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )
    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
    )

    # Profile
    full_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    # Anthropometric Data
    date_of_birth: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )
    gender: Mapped[Gender | None] = mapped_column(
        Enum(Gender, name="gender_enum", values_callable=enum_values),
        nullable=True,
    )
    height_cm: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    weight_kg: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    body_fat_percentage: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Fitness Configuration
    activity_level: Mapped[ActivityLevel | None] = mapped_column(
        Enum(ActivityLevel, name="activity_level_enum", values_callable=enum_values),
        nullable=True,
        default=ActivityLevel.MODERATE,
    )
    goal: Mapped[FitnessGoal | None] = mapped_column(
        Enum(FitnessGoal, name="fitness_goal_enum", values_callable=enum_values),
        nullable=True,
        default=FitnessGoal.MAINTAIN,
    )

    # Profile picture URL (optional)
    avatar_url: Mapped[str | None] = mapped_column(
        Text,
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

    # ── Relationships ─────────────────────────────────────────────
    meals = relationship("Meal", back_populates="user", lazy="selectin")
    body_scans = relationship("BodyScan", back_populates="user", lazy="selectin")
    workout_sessions = relationship("WorkoutSession", back_populates="user", lazy="selectin")
    daily_metrics = relationship("DailyMetric", back_populates="user", lazy="selectin")

    def __repr__(self) -> str:
        return f"<User {self.email}>"
