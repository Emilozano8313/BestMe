"""
BestMe — Meal Schemas
=======================
Pydantic schemas for AI vision analysis and manual meal confirmation.
"""

from __future__ import annotations

from typing import List, Optional
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.meal import MealType


class DetectedFood(BaseModel):
    """A single food item detected by AI or entered manually."""
    food: str = Field(..., description="Name of the food or ingredient")
    weight_g: float = Field(..., description="Estimated portion size in grams")
    calories: float = Field(..., description="Calories for this portion")
    protein_g: float = Field(..., description="Protein in grams")
    carbs_g: float = Field(..., description="Carbohydrates in grams")
    fat_g: float = Field(..., description="Fat in grams")


class AnalyzeResponse(BaseModel):
    """Response from the Vision API containing a list of detected foods."""
    foods: List[DetectedFood]


class MealCreate(BaseModel):
    """Payload to confirm and save a meal."""
    meal_type: MealType = Field(..., description="Breakfast, lunch, dinner, or snack")
    description: Optional[str] = Field(None, description="Optional note or description")
    photo_url: Optional[str] = Field(None, description="URL of the uploaded photo")
    detected_foods: List[DetectedFood] = Field(..., description="The validated list of foods")
    manually_adjusted: bool = Field(False, description="Whether the user edited the AI estimates")


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

    class Config:
        from_attributes = True
