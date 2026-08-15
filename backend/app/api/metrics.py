"""
BestMe — Metrics API Router
==============================
Endpoints for metabolic profile calculation, onboarding data capture,
and daily metrics snapshot persistence.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.models.daily_metric import DailyMetric
from app.models.user import User
from app.schemas.metrics import (
    MacroSplitSchema,
    MetabolicProfileResponse,
    OnboardingRequest,
    OnboardingResponse,
    SnapshotResponse,
)
from app.services.metabolic import MetabolicEngine

router = APIRouter(prefix="/metrics", tags=["Metabolic Engine"])


# ── Helpers ──────────────────────────────────────────────────────

def _validate_user_has_profile(user: User) -> None:
    """Raise 400 if the user hasn't completed onboarding (missing required fields)."""
    missing = []
    if user.date_of_birth is None:
        missing.append("date_of_birth")
    if user.gender is None:
        missing.append("gender")
    if user.height_cm is None:
        missing.append("height_cm")
    if user.weight_kg is None:
        missing.append("weight_kg")
    if user.activity_level is None:
        missing.append("activity_level")
    if user.goal is None:
        missing.append("goal")

    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Perfil incompleto. Faltan: {', '.join(missing)}. Completa el onboarding primero.",
        )


def _build_metabolic_response(user: User) -> MetabolicProfileResponse:
    """Compute the full metabolic profile from a User ORM instance."""
    snapshot = MetabolicEngine.compute_full_profile(
        weight_kg=user.weight_kg,
        height_cm=user.height_cm,
        date_of_birth=user.date_of_birth,
        gender=user.gender.value,
        activity_level=user.activity_level.value,
        goal=user.goal.value,
        body_fat_percentage=user.body_fat_percentage,
    )

    return MetabolicProfileResponse(
        bmr=snapshot.bmr,
        equation_used=snapshot.equation_used.value,
        lean_mass_kg=snapshot.lean_mass_kg,
        tdee=snapshot.tdee,
        calorie_target=snapshot.calorie_target,
        macros=MacroSplitSchema(
            protein_g=snapshot.macros.protein_g,
            carbs_g=snapshot.macros.carbs_g,
            fat_g=snapshot.macros.fat_g,
            protein_kcal=snapshot.macros.protein_kcal,
            carbs_kcal=snapshot.macros.carbs_kcal,
            fat_kcal=snapshot.macros.fat_kcal,
        ),
        activity_level=snapshot.activity_level,
        goal=snapshot.goal,
    )


async def _upsert_today_snapshot(
    db: AsyncSession,
    user: User,
    profile: MetabolicProfileResponse,
    weight_kg: float | None,
) -> DailyMetric:
    """
    Write today's metabolic targets into `daily_metrics` (upsert).

    Only touches the target_* columns — the consumed macros
    (protein_g / carbs_g / fat_g) belong to the meals log.
    """
    today = date.today()
    result = await db.execute(
        select(DailyMetric).where(
            DailyMetric.user_id == user.id,
            DailyMetric.date == today,
        )
    )
    metric = result.scalar_one_or_none()

    if metric is None:
        metric = DailyMetric(user_id=user.id, date=today)

    metric.bmr = profile.bmr
    metric.tdee = profile.tdee
    metric.calorie_target = profile.calorie_target
    metric.target_protein_g = profile.macros.protein_g
    metric.target_carbs_g = profile.macros.carbs_g
    metric.target_fat_g = profile.macros.fat_g
    metric.weight_kg = weight_kg
    metric.updated_at = datetime.now(timezone.utc)

    db.add(metric)
    return metric


# ── Endpoints ────────────────────────────────────────────────────

@router.get("/today_summary")
async def get_today_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Returns today's aggregate metrics: what was consumed, what was burned,
    and the targets the metabolic engine set.

    Used by the Home Dashboard and the Nutrition screen so neither has to
    re-sum the meals list client-side.
    """
    today = date.today()
    result = await db.execute(
        select(DailyMetric).where(
            DailyMetric.user_id == current_user.id,
            DailyMetric.date == today,
        )
    )
    metric = result.scalar_one_or_none()

    if not metric:
        return {
            "calories_consumed": 0.0,
            "calories_burned": 0.0,
            "workout_minutes": 0.0,
            "protein_g": 0.0,
            "carbs_g": 0.0,
            "fat_g": 0.0,
            "calorie_target": None,
            "target_protein_g": None,
            "target_carbs_g": None,
            "target_fat_g": None,
        }

    return {
        "calories_consumed": metric.calories_consumed,
        "calories_burned": metric.calories_burned,
        "workout_minutes": metric.workout_minutes,
        "protein_g": metric.protein_g,
        "carbs_g": metric.carbs_g,
        "fat_g": metric.fat_g,
        "calorie_target": metric.calorie_target,
        "target_protein_g": metric.target_protein_g,
        "target_carbs_g": metric.target_carbs_g,
        "target_fat_g": metric.target_fat_g,
    }


@router.get("/profile", response_model=MetabolicProfileResponse)
async def get_metabolic_profile(
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Calculate and return the current user's full metabolic profile.

    Requires the user to have completed onboarding (all anthropometric
    data must be present). Computation is done on-the-fly from the
    latest user data — not from a cached snapshot.
    """
    _validate_user_has_profile(current_user)
    return _build_metabolic_response(current_user)


@router.post(
    "/onboarding",
    response_model=OnboardingResponse,
    status_code=status.HTTP_200_OK,
)
async def complete_onboarding(
    data: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Save anthropometric data from the onboarding flow and return
    the computed metabolic profile.

    This endpoint:
      1. Updates the user's profile with the submitted data.
      2. Computes BMR, TDEE, calorie target, and macro split.
      3. Creates an initial daily_metrics snapshot for today.
      4. Returns the full metabolic profile.
    """
    # 1. Update user profile
    current_user.date_of_birth = data.date_of_birth
    current_user.gender = data.gender
    current_user.height_cm = data.height_cm
    current_user.weight_kg = data.weight_kg
    current_user.body_fat_percentage = data.body_fat_percentage
    current_user.activity_level = data.activity_level
    current_user.goal = data.goal
    current_user.updated_at = datetime.now(timezone.utc)

    db.add(current_user)
    await db.flush()

    # 2. Compute metabolic profile
    profile = _build_metabolic_response(current_user)

    # 3. Upsert today's daily_metrics snapshot
    await _upsert_today_snapshot(db, current_user, profile, data.weight_kg)
    await db.commit()

    return OnboardingResponse(metabolic_profile=profile)


@router.post("/snapshot", response_model=SnapshotResponse)
async def save_daily_snapshot(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Persist a snapshot of the current metabolic values into daily_metrics
    for today's date (upsert).

    Useful for tracking historical metabolic data over time even as the
    user's weight, body fat, or activity level changes.
    """
    _validate_user_has_profile(current_user)

    profile = _build_metabolic_response(current_user)

    await _upsert_today_snapshot(db, current_user, profile, current_user.weight_kg)
    await db.commit()

    return SnapshotResponse(
        date=date.today(),
        bmr=profile.bmr,
        tdee=profile.tdee,
        calorie_target=profile.calorie_target,
        macros=profile.macros,
    )
