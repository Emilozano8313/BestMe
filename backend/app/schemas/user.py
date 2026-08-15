"""
BestMe — User Schemas
=======================
Pydantic schemas for user data validation and serialization.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import ActivityLevel, FitnessGoal, Gender


class UserBase(BaseModel):
    """Base fields shared across user schemas."""
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=150)
    date_of_birth: Optional[date] = None
    gender: Optional[Gender] = None
    height_cm: Optional[float] = Field(None, gt=0)
    weight_kg: Optional[float] = Field(None, gt=0)
    body_fat_percentage: Optional[float] = Field(None, ge=0, le=100)
    activity_level: Optional[ActivityLevel] = ActivityLevel.MODERATE
    goal: Optional[FitnessGoal] = FitnessGoal.MAINTAIN
    avatar_url: Optional[str] = None


class UserCreate(UserBase):
    """Schema for creating a new user (registration)."""
    password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    """Schema for updating an existing user."""
    full_name: Optional[str] = Field(None, min_length=2, max_length=150)
    date_of_birth: Optional[date] = None
    gender: Optional[Gender] = None
    height_cm: Optional[float] = Field(None, gt=0)
    weight_kg: Optional[float] = Field(None, gt=0)
    body_fat_percentage: Optional[float] = Field(None, ge=0, le=100)
    activity_level: Optional[ActivityLevel] = None
    goal: Optional[FitnessGoal] = None
    avatar_url: Optional[str] = None


class UserResponse(UserBase):
    """Schema for returning user data (excludes password)."""
    id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
