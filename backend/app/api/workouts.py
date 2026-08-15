"""
BestMe — Workouts Router
==========================
Endpoints for saving biomechanical training sessions and calculating 
bioenergetic expenditure using MET values.
"""

from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.workout_session import WorkoutSession
from app.models.daily_metric import DailyMetric
from app.schemas.workout import WorkoutSessionCreate, WorkoutSessionResponse

router = APIRouter(prefix="/api/workouts", tags=["workouts"])

# MET Values (Metabolic Equivalent of Task)
# Standard visual references:
# Weight lifting (vigorous, squats, deadlifts): 6.0
# Weight lifting (light/moderate): 3.0
# Pushups/situps (calisthenics): 3.8
MET_DICTIONARY = {
    "squat": 6.0,
    "pushup": 3.8,
    "deadlift": 6.0,
    "bench_press": 5.0,
    "default": 4.0,
}

@router.post("/", response_model=WorkoutSessionResponse)
async def create_workout_session(
    workout_in: WorkoutSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Saves a completed workout session, calculating burned calories
    strictly based on the MET formula:
    Calories = MET * Weight(kg) * Duration(hours)
    """
    # 1. Calculate Average Form Score
    total_sets = len(workout_in.sets)
    avg_form = 0.0
    if total_sets > 0:
        avg_form = sum(s.form_score for s in workout_in.sets) / total_sets

    # 2. Calculate Bioenergetics (MET formula)
    # Get MET value for the exercise, fallback to default
    ex_name_lower = workout_in.exercise_name.lower()
    met_value = MET_DICTIONARY.get(ex_name_lower, MET_DICTIONARY["default"])
    
    # Get user's weight, fallback to 70kg if not set
    weight_kg = current_user.weight_kg if current_user.weight_kg and current_user.weight_kg > 0 else 70.0
    
    # Calculate duration in hours
    duration_hours = workout_in.duration_seconds / 3600.0
    
    # Final formula
    calories_burned = met_value * weight_kg * duration_hours

    # 3. Save WorkoutSession
    ended_at = datetime.now(timezone.utc)
    # Prefer the client's timestamp; otherwise reconstruct the start from the
    # duration, so a session never lands in the DB with zero elapsed time.
    started_at = workout_in.started_at or (
        ended_at - timedelta(seconds=workout_in.duration_seconds)
    )
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)

    new_session = WorkoutSession(
        user_id=current_user.id,
        exercise_name=workout_in.exercise_name,
        sets=[s.model_dump() for s in workout_in.sets],
        total_sets=total_sets,
        total_reps=workout_in.total_reps,
        avg_form_score=avg_form,
        duration_seconds=workout_in.duration_seconds,
        calories_burned=calories_burned,
        analysis_summary=workout_in.analysis_summary,
        started_at=started_at,
        ended_at=ended_at,
    )
    db.add(new_session)

    # 4. Upsert DailyMetric
    today = datetime.now(timezone.utc).date()
    result = await db.execute(
        select(DailyMetric).where(
            DailyMetric.user_id == current_user.id,
            DailyMetric.date == today
        )
    )
    daily_metric = result.scalars().first()

    workout_minutes = workout_in.duration_seconds / 60.0

    if daily_metric:
        daily_metric.calories_burned += calories_burned
        daily_metric.workout_minutes += workout_minutes
    else:
        # Create new snapshot if doesn't exist
        daily_metric = DailyMetric(
            user_id=current_user.id,
            date=today,
            calories_burned=calories_burned,
            workout_minutes=workout_minutes,
        )
        db.add(daily_metric)

    await db.commit()
    await db.refresh(new_session)

    return new_session


@router.get("/today", response_model=List[WorkoutSessionResponse])
async def get_todays_workouts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the workout sessions logged by the user today.
    """
    today = datetime.now(timezone.utc).date()
    start_of_day = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    
    result = await db.execute(
        select(WorkoutSession)
        .where(
            WorkoutSession.user_id == current_user.id,
            WorkoutSession.created_at >= start_of_day
        )
        .order_by(WorkoutSession.created_at.asc())
    )
    
    return result.scalars().all()
