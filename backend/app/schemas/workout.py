"""
BestMe — Workout Schemas
==========================
Pydantic schemas for bioenergetic tracking and biomechanical session data.
"""

from __future__ import annotations

from typing import List, Optional
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WorkoutSet(BaseModel):
    """Data for a single exercise set, including form quality."""
    set_number: int
    reps: int
    weight_kg: float
    form_score: float = Field(..., ge=0.0, le=1.0)
    issues: List[str] = Field(default_factory=list)


class WorkoutSessionCreate(BaseModel):
    """Payload to log a completed workout session."""
    exercise_name: str = Field(..., description="E.g., 'squat', 'pushup'")
    sets: List[WorkoutSet] = Field(default_factory=list)
    total_reps: int = Field(..., description="Total repetitions performed")
    duration_seconds: int = Field(..., description="Total active duration in seconds")
    analysis_summary: dict = Field(default_factory=dict, description="Summary from Edge AI")


class WorkoutSessionResponse(BaseModel):
    """Response containing the saved workout session."""
    id: UUID
    exercise_name: str
    total_sets: int
    total_reps: int
    avg_form_score: Optional[float]
    duration_seconds: Optional[int]
    calories_burned: float
    analysis_summary: dict
    started_at: datetime
    ended_at: Optional[datetime]

    class Config:
        from_attributes = True
