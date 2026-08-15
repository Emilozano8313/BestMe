"""
BestMe — Meal Schemas
=======================
Pydantic schemas for AI vision analysis and manual meal confirmation.
"""

from __future__ import annotations

from typing import List, Optional
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.meal import MealType


class DetectedFood(BaseModel):
    """A single food item detected by AI or entered manually."""
    food: str = Field(..., description="Name of the food or ingredient")
    weight_g: float = Field(..., ge=0, description="Estimated portion size in grams")
    calories: float = Field(..., ge=0, description="Calories for this portion")
    protein_g: float = Field(..., ge=0, description="Protein in grams")
    carbs_g: float = Field(..., ge=0, description="Carbohydrates in grams")
    fat_g: float = Field(..., ge=0, description="Fat in grams")
    confidence: Optional[float] = Field(
        None,
        ge=0,
        le=1,
        description="How sure the AI is about the portion size (0-1)",
    )


class AnalyzeResponse(BaseModel):
    """Response from the Vision API containing a list of detected foods."""
    foods: List[DetectedFood]
    is_mock: bool = Field(
        False,
        description="True when no AI key is configured and this is sample data",
    )


class MealCreate(BaseModel):
    """Payload to confirm and save a meal."""
    meal_type: MealType = Field(..., description="Breakfast, lunch, dinner, or snack")
    description: Optional[str] = Field(None, description="Optional note or description")
    photo_url: Optional[str] = Field(None, description="URL of the uploaded photo")
    detected_foods: List[DetectedFood] = Field(..., description="The validated list of foods")
    manually_adjusted: bool = Field(False, description="Whether the user edited the AI estimates")


class MealUpdate(BaseModel):
    """
    Payload to correct an already-saved meal.

    The full food list is replaced, and the router recomputes the totals
    and applies the difference to the day's `daily_metrics` row.
    """
    detected_foods: List[DetectedFood] = Field(..., description="The corrected list of foods")
    description: Optional[str] = Field(None, description="Optional updated note")
    meal_type: Optional[MealType] = Field(None, description="Optional corrected meal type")


class MealResponse(BaseModel):
    """Response showing a saved meal."""
    id: UUID
    meal_type: MealType
    description: Optional[str]
    total_calories: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    detected_foods: List[dict]
    logged_at: datetime

    model_config = ConfigDict(from_attributes=True)
