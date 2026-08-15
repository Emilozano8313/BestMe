"""
BestMe — Body Scan Schemas
============================
Pydantic schemas for biometric capture and AI estimation.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

# Below this, the estimate is too shaky to be worth acting on. Estimating
# body fat from a single photo carries a several-point margin of error even
# under good conditions.
MIN_USABLE_CONFIDENCE = 0.35


class ScanPreviewResponse(BaseModel):
    """
    Result of analysing a body photo — nothing has been saved yet.

    The user reviews this and decides whether to apply it, because accepting
    it rewrites their body fat percentage and therefore their whole
    calorie target.
    """
    estimated_body_fat: float = Field(..., description="Estimated body fat %")
    confidence_score: float = Field(..., ge=0, le=1, description="0.0 to 1.0 confidence")
    notes: str = Field("", description="Short observations from the analysis")
    limiting_factors: List[str] = Field(
        default_factory=list,
        description="What reduced confidence (clothing, angle, lighting...)",
    )
    is_reliable: bool = Field(
        ...,
        description="False when confidence is too low to act on",
    )
    is_mock: bool = Field(
        False,
        description="True when no AI key is configured and this is sample data",
    )

    # What the metabolic profile *would* become — a preview, not applied.
    projected_bmr: Optional[float] = None
    projected_tdee: Optional[float] = None
    projected_calorie_target: Optional[float] = None
    projected_equation: Optional[str] = None


class ScanConfirmRequest(BaseModel):
    """User-confirmed body fat percentage, ready to be applied."""
    estimated_body_fat: float = Field(
        ...,
        gt=0,
        lt=100,
        description="Body fat %, possibly corrected by the user",
    )
    confidence_score: float = Field(
        default=1.0,
        ge=0,
        le=1,
        description="Confidence reported by the analysis that produced it",
    )
    notes: str = Field("", description="Observations carried over from the preview")


class BodyScanResponse(BaseModel):
    """Response containing the saved scan and the updated metabolic profile."""
    id: UUID
    estimated_body_fat: float
    confidence_score: float
    weight_at_scan_kg: Optional[float]
    scanned_at: datetime

    # The recomputed profile, so the client can update without a second call.
    new_tdee: float
    new_bmr: float
    new_calorie_target: float
    equation_used: str

    class Config:
        from_attributes = True
