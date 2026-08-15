"""
BestMe — Meal Model
=====================
Tracks food intake with AI-detected foods and macronutrient breakdown.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MealType(str, enum.Enum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


class Meal(Base):
    __tablename__ = "meals"

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

    # Meal info
    meal_type: Mapped[MealType] = mapped_column(
        Enum(MealType, name="meal_type_enum"),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    # Photo (sent for AI analysis)
    photo_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # AI-detected foods — stored as JSONB for flexible schema
    # Format: [{"name": "chicken", "portion_g": 150, "confidence": 0.92, ...}]
    detected_foods: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        default=list,
    )

    # Macronutrient totals (computed from detected_foods or manual entry)
    total_calories: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    total_protein_g: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    total_carbs_g: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    total_fat_g: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    total_fiber_g: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    # Whether the user manually adjusted the AI results
    manually_adjusted: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
    )

    # Timestamps
    logged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── Relationship ──────────────────────────────────────────────
    user = relationship("User", back_populates="meals")

    def __repr__(self) -> str:
        return f"<Meal {self.meal_type.value} user={self.user_id}>"
