"""
BestMe — Body Scan Model
==========================
Stores body composition estimates from AI photo analysis.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.types import JSONColumn, UUIDColumn


class BodyScan(Base):
    __tablename__ = "body_scans"

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

    # Photo used for analysis
    photo_url: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    # AI estimation results
    estimated_body_fat: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )
    confidence_score: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        comment="0.0 to 1.0 confidence in the estimation",
    )

    # Additional analysis metadata
    # e.g. {"waist_hip_ratio": 0.85, "shoulder_waist_ratio": 1.4, "category": "athletic"}
    scan_metadata: Mapped[dict | None] = mapped_column(
        JSONColumn,
        nullable=True,
        default=dict,
    )

    # User's self-reported weight at time of scan (for calibration)
    weight_at_scan_kg: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Timestamps
    scanned_at: Mapped[datetime] = mapped_column(
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
    user = relationship("User", back_populates="body_scans")

    def __repr__(self) -> str:
        return f"<BodyScan bf={self.estimated_body_fat}% user={self.user_id}>"
