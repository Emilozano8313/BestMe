"""
BestMe — Workouts Router
==========================
Endpoints for saving biomechanical training sessions and calculating 
bioenergetic expenditure using MET values.
"""

from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.workout_session import WorkoutSession
from app.models.daily_metric import DailyMetric
from app.schemas.workout import (
    PlannedExerciseSchema,
    WarmupStepSchema,
    WorkoutPlanResponse,
    WorkoutSessionCreate,
    WorkoutSessionResponse,
)
from app.services.workout_planner import SESSION_MET, WorkoutPlanner

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
    # Logged by the "Tu rutina de hoy" session runner — same blended MET
    # WorkoutPlanner already uses to *estimate* that plan's calories, so
    # the number the user sees before starting matches what gets logged.
    "circuito": SESSION_MET,
    # Flat fallbacks for GPS routes (caminar/correr/ciclismo) when distance
    # is missing or duration is too short to derive a speed — see
    # _distance_activity_met() for the speed-based value used otherwise.
    "caminar": 3.5,
    "correr": 8.3,
    "ciclismo": 6.8,
    "default": 4.0,
}

# Speed-based MET tables (Compendium of Physical Activities, level ground).
# Each entry is (speed upper bound in km/h, MET); the last entry has no
# upper bound and applies to anything faster.
_WALK_MET_TABLE = [
    (3.2, 2.0),
    (4.7, 2.8),
    (5.5, 3.5),
    (6.4, 4.3),
    (7.2, 5.0),
    (None, 6.5),
]
_RUN_MET_TABLE = [
    (8.0, 6.0),
    (9.6, 8.3),
    (10.8, 9.8),
    (11.3, 10.0),
    (12.9, 11.0),
    (13.8, 11.8),
    (16.1, 12.8),
    (17.7, 14.5),
    (None, 16.0),
]
_CYCLE_MET_TABLE = [
    (16.0, 4.0),
    (19.3, 6.8),
    (22.5, 8.0),
    (25.7, 10.0),
    (30.6, 12.0),
    (None, 15.8),
]
_DISTANCE_ACTIVITY_TABLES = {
    "caminar": _WALK_MET_TABLE,
    "correr": _RUN_MET_TABLE,
    "ciclismo": _CYCLE_MET_TABLE,
}


def _distance_activity_met(
    ex_name_lower: str, distance_km: float | None, duration_seconds: int
) -> float | None:
    """
    Speed-based MET for a GPS-tracked route: faster paces burn more per
    hour than the flat MET_DICTIONARY fallback captures. Returns None when
    the activity isn't distance-based or there's not enough data to derive
    a speed, so the caller falls back to the flat value.
    """
    table = _DISTANCE_ACTIVITY_TABLES.get(ex_name_lower)
    if table is None or not distance_km or duration_seconds <= 0:
        return None

    speed_kmh = distance_km / (duration_seconds / 3600.0)
    for upper_bound, met in table:
        if upper_bound is None or speed_kmh <= upper_bound:
            return met
    return table[-1][1]

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
    # Get MET value for the exercise: speed-based for GPS routes (a brisk
    # run burns more per hour than a slow jog), flat lookup otherwise.
    ex_name_lower = workout_in.exercise_name.lower()
    met_value = _distance_activity_met(
        ex_name_lower, workout_in.distance_km, workout_in.duration_seconds
    ) or MET_DICTIONARY.get(ex_name_lower, MET_DICTIONARY["default"])

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
        distance_km=workout_in.distance_km,
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


@router.get("/plan", response_model=WorkoutPlanResponse)
async def get_workout_plan(
    location: Literal["home", "gym"] = Query(
        ..., description="Dónde vas a entrenar hoy"
    ),
    focus: Optional[
        Literal["legs", "push", "pull", "shoulders", "core", "full_body"]
    ] = Query(
        None,
        description=(
            "Grupo muscular único para una sesión enfocada (p. ej. 'push' "
            "para un día de pecho). Omite para la sesión balanceada de siempre."
        ),
    ),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a session for today from the user's stored profile: a balanced
    circuit by default, or several exercises from one muscle group if
    `focus` is given.

    This is a rule-based recommendation (WorkoutPlanner), not a Claude call —
    it costs nothing and works with no ANTHROPIC_API_KEY configured.
    """
    if not current_user.goal or not current_user.activity_level:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completa tu objetivo y nivel de actividad en el perfil para generar un plan.",
        )

    plan = WorkoutPlanner.compute_plan(
        goal=current_user.goal.value,
        activity_level=current_user.activity_level.value,
        location=location,
        weight_kg=current_user.weight_kg,
        focus=focus,
    )

    return WorkoutPlanResponse(
        location=plan.location.value,
        goal=plan.goal,
        focus=plan.focus,
        warmup_minutes=plan.warmup_minutes,
        warmup_exercises=[
            WarmupStepSchema(name=step.name, duration_seconds=step.duration_seconds)
            for step in plan.warmup_exercises
        ],
        exercises=[
            PlannedExerciseSchema(
                name=ex.name,
                muscle_group=ex.muscle_group.value,
                sets=ex.sets,
                reps_label=ex.reps_label,
                rest_seconds=ex.rest_seconds,
                is_compound=ex.is_compound,
            )
            for ex in plan.exercises
        ],
        includes_cardio_finisher=plan.includes_cardio_finisher,
        cardio_finisher_note=plan.cardio_finisher_note,
        estimated_duration_minutes=plan.estimated_duration_minutes,
        estimated_calories_burned=plan.estimated_calories_burned,
        coach_note=plan.coach_note,
    )
