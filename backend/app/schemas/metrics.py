"""
BestMe — Metrics Schemas
==========================
Pydantic schemas for metabolic profile, onboarding, and macro splits.
"""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

# A field named `date` with a default binds the name inside the class body,
# so the annotation `Optional[date]` would then resolve to that field rather
# than to the type. This alias keeps the type reachable.
DateOnly = date

from app.models.user import ActivityLevel, FitnessGoal, Gender


class MacroSplitSchema(BaseModel):
    """Macronutrient distribution in grams and kilocalories."""
    protein_g: float
    carbs_g: float
    fat_g: float
    protein_kcal: float
    carbs_kcal: float
    fat_kcal: float


class MetabolicProfileResponse(BaseModel):
    """Full metabolic profile returned by the API."""
    bmr: float = Field(..., description="Basal Metabolic Rate (kcal/day)")
    equation_used: str = Field(
        ...,
        description="Equation used: 'mifflin_st_jeor' or 'katch_mcardle'",
    )
    lean_mass_kg: Optional[float] = Field(
        None,
        description="Lean body mass in kg (only if Katch-McArdle was used)",
    )
    tdee: float = Field(..., description="Total Daily Energy Expenditure (kcal/day)")
    calorie_target: float = Field(
        ...,
        description="Daily calorie target adjusted for goal",
    )
    macros: MacroSplitSchema
    activity_level: str
    goal: str


class OnboardingRequest(BaseModel):
    """
    Input schema for the onboarding endpoint.

    Captures all anthropometric and fitness configuration data
    needed to calculate the initial metabolic profile.
    """
    date_of_birth: date = Field(..., description="User's date of birth (YYYY-MM-DD)")
    gender: Gender = Field(..., description="Biological sex for BMR equation")
    height_cm: float = Field(..., gt=0, le=300, description="Height in centimeters")
    weight_kg: float = Field(..., gt=0, le=500, description="Weight in kilograms")
    body_fat_percentage: Optional[float] = Field(
        None,
        ge=0,
        le=100,
        description="Body fat percentage (0-100). If provided, Katch-McArdle is used.",
    )
    activity_level: ActivityLevel = Field(
        ...,
        description="Physical activity level",
    )
    goal: FitnessGoal = Field(
        ...,
        description="Fitness goal",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "date_of_birth": "1995-06-15",
                "gender": "male",
                "height_cm": 178.0,
                "weight_kg": 82.0,
                "body_fat_percentage": 18.5,
                "activity_level": "moderate",
                "goal": "gain_muscle",
            }
        }
    )


class OnboardingResponse(BaseModel):
    """Response after completing onboarding — includes user confirmation and metabolic profile."""
    message: str = "Onboarding completado exitosamente"
    metabolic_profile: MetabolicProfileResponse


class SnapshotResponse(BaseModel):
    """Response after persisting a daily metrics snapshot."""
    message: str = "Snapshot guardado exitosamente"
    date: date
    bmr: float
    tdee: float
    calorie_target: float
    macros: MacroSplitSchema


# ── History ──────────────────────────────────────────────────────


class DailyPoint(BaseModel):
    """One day in the history series."""
    date: date
    calories_consumed: float
    calories_burned: float
    calorie_target: Optional[float] = None
    protein_g: float
    carbs_g: float
    fat_g: float
    target_protein_g: Optional[float] = None
    target_carbs_g: Optional[float] = None
    target_fat_g: Optional[float] = None
    weight_kg: Optional[float] = None
    workout_minutes: float
    meal_count: int


class HistorySummary(BaseModel):
    """Aggregates over the requested window, for the stat tiles."""
    days_with_data: int
    avg_calories_consumed: Optional[float] = None
    avg_calories_burned: Optional[float] = None
    days_on_target: int = Field(
        0,
        description="Days within 10% of the calorie target",
    )
    latest_weight_kg: Optional[float] = None
    weight_change_kg: Optional[float] = Field(
        None,
        description="Latest weight minus the earliest in the window",
    )
    total_workout_minutes: float = 0


class HistoryResponse(BaseModel):
    """Daily series plus its summary."""
    days: int
    points: List[DailyPoint]
    summary: HistorySummary


class WeightLogRequest(BaseModel):
    """A daily weight check-in."""
    weight_kg: float = Field(..., gt=20, lt=400, description="Weight in kilograms")
    date: Optional[DateOnly] = Field(
        None,
        description="Defaults to today. Use to backfill a missed day.",
    )


class WeightLogResponse(BaseModel):
    """Confirmation plus the recomputed metabolic profile."""
    date: date
    weight_kg: float
    metabolic_profile: MetabolicProfileResponse
