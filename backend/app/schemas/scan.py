"""
BestMe — Body Scan Schemas
============================
Pydantic schemas for biometric capture and AI estimation.
"""

from __future__ import annotations

from typing import Optional, Dict, Any
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ScanAnalyzeResponse(BaseModel):
    """Response from Vision API after evaluating the photo."""
    estimated_body_fat: float = Field(..., description="Estimated BF%")
    confidence_score: float = Field(..., description="0.0 to 1.0 confidence")
    scan_metadata: Dict[str, Any] = Field(default_factory=dict)


class BodyScanResponse(BaseModel):
    """Response containing the saved scan and updated metabolic profile."""
    id: UUID
    estimated_body_fat: float
    confidence_score: float
    weight_at_scan_kg: Optional[float]
    scanned_at: datetime
    
    # We return the new metabolic profile details to inform the frontend
    new_tdee: float
    new_bmr: float
    new_calorie_target: float
    equation_used: str

    class Config:
        from_attributes = True
