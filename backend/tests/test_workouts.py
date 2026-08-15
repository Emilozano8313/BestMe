"""
BestMe — Workout Tests
========================
Covers the MET bioenergetics calculation and how sessions roll into
`daily_metrics`.
"""

from datetime import datetime, timezone

from httpx import AsyncClient
from sqlalchemy import select

from app.models.daily_metric import DailyMetric
from app.models.user import User

SQUAT_SESSION = {
    "exercise_name": "squat",  # MET 6.0
    "total_reps": 15,
    "duration_seconds": 1800,  # 30 min = 0.5 h
    "sets": [
        {"set_number": 1, "reps": 15, "weight_kg": 60.0, "form_score": 0.9, "issues": []}
    ],
    "analysis_summary": {},
}


async def test_met_calorie_calculation(
    async_client: AsyncClient, auth_headers: dict, test_user: User, db_session
):
    """Calories = MET x weight(kg) x hours -> 6.0 x 82 x 0.5 = 246."""
    response = await async_client.post("/api/workouts/", headers=auth_headers, json=SQUAT_SESSION)

    assert response.status_code == 200
    data = response.json()
    assert data["calories_burned"] == 246.0
    assert data["avg_form_score"] == 0.9

    today = datetime.now(timezone.utc).date()
    metric = (
        await db_session.execute(
            select(DailyMetric).where(
                DailyMetric.user_id == test_user.id,
                DailyMetric.date == today,
            )
        )
    ).scalars().first()

    assert metric is not None
    assert metric.calories_burned == 246.0
    assert metric.workout_minutes == 30.0


async def test_session_is_not_stored_with_zero_duration(
    async_client: AsyncClient, auth_headers: dict
):
    """
    Regression test: `started_at` used to be set equal to `ended_at`, so every
    session was persisted as zero-length regardless of its real duration.
    """
    response = await async_client.post("/api/workouts/", headers=auth_headers, json=SQUAT_SESSION)

    data = response.json()
    started = datetime.fromisoformat(data["started_at"])
    ended = datetime.fromisoformat(data["ended_at"])

    elapsed = (ended - started).total_seconds()
    assert elapsed == 1800, f"se esperaban 1800 s de sesión, se obtuvieron {elapsed}"


async def test_unknown_exercise_uses_default_met(
    async_client: AsyncClient, auth_headers: dict
):
    """An unmapped exercise falls back to MET 4.0 -> 4.0 x 82 x 0.5 = 164."""
    payload = {**SQUAT_SESSION, "exercise_name": "burpee-invented"}
    response = await async_client.post("/api/workouts/", headers=auth_headers, json=payload)

    assert response.status_code == 200
    assert response.json()["calories_burned"] == 164.0


async def test_get_todays_workouts(async_client: AsyncClient, auth_headers: dict):
    await async_client.post("/api/workouts/", headers=auth_headers, json=SQUAT_SESSION)

    response = await async_client.get("/api/workouts/today", headers=auth_headers)

    assert response.status_code == 200
    sessions = response.json()
    assert len(sessions) == 1
    assert sessions[0]["exercise_name"] == "squat"


async def test_workouts_require_authentication(async_client: AsyncClient):
    response = await async_client.get("/api/workouts/today")
    assert response.status_code == 401
