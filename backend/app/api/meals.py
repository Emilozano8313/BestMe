"""
BestMe — Meals Router
=======================
Endpoints for AI visual analysis and saving validated meals.
Updates daily metrics progressively.
"""

import logging
from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.security import get_current_user
from app.core.uploads import read_image_upload
from app.models.user import User
from app.models.meal import Meal
from app.models.daily_metric import DailyMetric
from app.schemas.meal import AnalyzeResponse, MealCreate, MealResponse, MealUpdate, DetectedFood
from app.services.vision import VisionError, VisionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meals", tags=["meals"])


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_meal_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Estimate the nutritional content of a meal photo.

    Nothing is persisted here — the user reviews and corrects the estimate
    on the validation screen before it becomes a meal.
    """
    base64_image, media_type = await read_image_upload(file)

    try:
        detected_foods = await VisionService.analyze_meal_image(base64_image, media_type)
    except VisionError as exc:
        # Message is already user-facing and free of internals.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except Exception:
        logger.exception("Unexpected failure analysing meal image")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo analizar la imagen.",
        )

    return AnalyzeResponse(
        foods=[DetectedFood(**food) for food in detected_foods],
        is_mock=not VisionService.is_configured(),
    )


@router.post("/", response_model=MealResponse, status_code=201)
async def create_meal(
    meal_in: MealCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Saves a confirmed meal to the database.
    Calculates macro totals and updates the user's daily metrics.
    """
    total_calories = sum(food.calories for food in meal_in.detected_foods)
    total_protein  = sum(food.protein_g for food in meal_in.detected_foods)
    total_carbs    = sum(food.carbs_g for food in meal_in.detected_foods)
    total_fat      = sum(food.fat_g for food in meal_in.detected_foods)

    new_meal = Meal(
        user_id=current_user.id,
        meal_type=meal_in.meal_type,
        description=meal_in.description,
        photo_url=meal_in.photo_url,
        detected_foods=[f.model_dump() for f in meal_in.detected_foods],
        total_calories=total_calories,
        total_protein_g=total_protein,
        total_carbs_g=total_carbs,
        total_fat_g=total_fat,
        manually_adjusted=meal_in.manually_adjusted,
    )
    db.add(new_meal)

    # Upsert DailyMetric
    today = datetime.now(timezone.utc).date()
    result = await db.execute(
        select(DailyMetric).where(
            DailyMetric.user_id == current_user.id,
            DailyMetric.date == today,
        )
    )
    daily_metric = result.scalars().first()

    if daily_metric:
        daily_metric.calories_consumed += total_calories
        daily_metric.protein_g += total_protein
        daily_metric.carbs_g += total_carbs
        daily_metric.fat_g += total_fat
    else:
        daily_metric = DailyMetric(
            user_id=current_user.id,
            date=today,
            calories_consumed=total_calories,
            protein_g=total_protein,
            carbs_g=total_carbs,
            fat_g=total_fat,
        )
        db.add(daily_metric)

    await db.commit()
    await db.refresh(new_meal)
    return new_meal


@router.get("/today", response_model=List[MealResponse])
async def get_todays_meals(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the meals logged by the user today."""
    today = datetime.now(timezone.utc).date()
    start_of_day = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)

    result = await db.execute(
        select(Meal)
        .where(Meal.user_id == current_user.id, Meal.logged_at >= start_of_day)
        .order_by(Meal.logged_at.asc())
    )
    return result.scalars().all()


@router.get("/history", response_model=List[MealResponse])
async def get_meal_history(
    days: int = Query(default=7, ge=1, le=90, description="Number of past days to retrieve"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the meal history for the last N days."""
    from datetime import timedelta
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(Meal)
        .where(Meal.user_id == current_user.id, Meal.logged_at >= since)
        .order_by(Meal.logged_at.desc())
    )
    return result.scalars().all()


@router.put("/{meal_id}", response_model=MealResponse)
async def update_meal(
    meal_id: UUID,
    meal_in: MealUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allows the user to edit portions/foods in a logged meal."""
    result = await db.execute(
        select(Meal).where(Meal.id == meal_id, Meal.user_id == current_user.id)
    )
    meal = result.scalar_one_or_none()
    if not meal:
        raise HTTPException(status_code=404, detail="Comida no encontrada")

    # Snapshot old totals to adjust the DailyMetric delta
    old_calories = meal.total_calories
    old_protein  = meal.total_protein_g
    old_carbs    = meal.total_carbs_g
    old_fat      = meal.total_fat_g

    # Recalculate with the new foods list
    new_calories = sum(f.calories  for f in meal_in.detected_foods)
    new_protein  = sum(f.protein_g for f in meal_in.detected_foods)
    new_carbs    = sum(f.carbs_g   for f in meal_in.detected_foods)
    new_fat      = sum(f.fat_g     for f in meal_in.detected_foods)

    meal.detected_foods    = [f.model_dump() for f in meal_in.detected_foods]
    meal.total_calories    = new_calories
    meal.total_protein_g   = new_protein
    meal.total_carbs_g     = new_carbs
    meal.total_fat_g       = new_fat
    meal.manually_adjusted = True
    if meal_in.description is not None:
        meal.description = meal_in.description
    if meal_in.meal_type is not None:
        meal.meal_type = meal_in.meal_type

    # Apply delta to DailyMetric
    today  = meal.logged_at.date()
    dm_res = await db.execute(
        select(DailyMetric).where(
            DailyMetric.user_id == current_user.id, DailyMetric.date == today
        )
    )
    dm = dm_res.scalars().first()
    if dm:
        dm.calories_consumed += new_calories - old_calories
        dm.protein_g         += new_protein  - old_protein
        dm.carbs_g           += new_carbs    - old_carbs
        dm.fat_g             += new_fat      - old_fat

    await db.commit()
    await db.refresh(meal)
    return meal


@router.delete("/{meal_id}", status_code=204)
async def delete_meal(
    meal_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deletes a logged meal and corrects daily metric totals."""
    result = await db.execute(
        select(Meal).where(Meal.id == meal_id, Meal.user_id == current_user.id)
    )
    meal = result.scalar_one_or_none()
    if not meal:
        raise HTTPException(status_code=404, detail="Comida no encontrada")

    # Subtract from DailyMetric
    today  = meal.logged_at.date()
    dm_res = await db.execute(
        select(DailyMetric).where(
            DailyMetric.user_id == current_user.id, DailyMetric.date == today
        )
    )
    dm = dm_res.scalars().first()
    if dm:
        dm.calories_consumed = max(0, dm.calories_consumed - meal.total_calories)
        dm.protein_g         = max(0, dm.protein_g         - meal.total_protein_g)
        dm.carbs_g           = max(0, dm.carbs_g           - meal.total_carbs_g)
        dm.fat_g             = max(0, dm.fat_g             - meal.total_fat_g)

    await db.execute(delete(Meal).where(Meal.id == meal_id))
    await db.commit()
