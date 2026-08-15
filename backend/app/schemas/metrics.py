"""
BestMe — Metrics Schemas
==========================
Pydantic schemas for metabolic profile, onboarding, and macro splits.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

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
