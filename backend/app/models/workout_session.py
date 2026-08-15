"""
BestMe — Workout Session Model
================================
Records exercise sessions with per-set data, form scores, and rep counts.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.types import JSONColumn, UUIDColumn


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

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

    # Exercise info
    exercise_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    # Per-set data stored as JSONB array
    # Format: [{"set_number": 1, "reps": 12, "weight_kg": 60.0, "form_score": 0.87, "issues": ["knee_valgus"]}]
    sets: Mapped[dict | None] = mapped_column(
        JSONColumn,
        nullable=True,
        default=list,
    )

    # Aggregated metrics
    total_sets: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    total_reps: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    avg_form_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Average form quality score 0.0-1.0",
    )

    # Duration
    duration_seconds: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # Estimated calories burned
    calories_burned: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Biomechanical analysis summary from MediaPipe
    # e.g. {"common_issues": ["incomplete_rom"], "best_set": 2, "symmetry_score": 0.94}
    analysis_summary: Mapped[dict | None] = mapped_column(
        JSONColumn,
        nullable=True,
        default=dict,
    )

    # Timestamps
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── Relationship ──────────────────────────────────────────────
    user = relationship("User", back_populates="workout_sessions")

    def __repr__(self) -> str:
        return f"<WorkoutSession {self.exercise_name} reps={self.total_reps} user={self.user_id}>"
