"""
BestMe — Workout Tests
========================
Unit tests for the workout bioenergetics API (Phase 5).
"""

import pytest
from httpx import AsyncClient
from datetime import datetime, timezone
from sqlalchemy import select

from app.models.user import User
from app.models.daily_metric import DailyMetric


@pytest.mark.asyncio
async def test_create_workout_bioenergetics(async_client: AsyncClient, test_user: User, test_user_token: str, db_session):
    """
    Test that a workout session calculates MET calories burned properly
    and updates the daily_metric row.
    """
    # Ensure test user has weight set for formula
    test_user.weight_kg = 80.0
    db_session.add(test_user)
    await db_session.commit()

    # Create workout payload
    payload = {
        "exercise_name": "squat", # MET = 6.0
        "total_reps": 15,
        "duration_seconds": 1800, # 30 mins = 0.5 hours
        "sets": [
            {"set_number": 1, "reps": 15, "weight_kg": 60.0, "form_score": 0.9, "issues": []}
        ],
        "analysis_summary": {}
    }

    response = await async_client.post(
        "/api/workouts/",
        headers={"Authorization": f"Bearer {test_user_token}"},
        json=payload
    )

    assert response.status_code == 200
    data = response.json()
    
    # Expected kcal: 6.0 MET * 80kg * 0.5 hours = 240 kcal
    assert data["calories_burned"] == 240.0
    assert data["avg_form_score"] == 0.9

    # Check daily metrics update
    today = datetime.now(timezone.utc).date()
    metric_query = await db_session.execute(
        select(DailyMetric).where(DailyMetric.user_id == test_user.id, DailyMetric.date == today)
    )
    metric = metric_query.scalars().first()
    
    assert metric is not None
    assert metric.calories_burned >= 240.0  # Could be higher if previous tests added
    assert metric.workout_minutes >= 30.0


@pytest.mark.asyncio
async def test_get_todays_workouts(async_client: AsyncClient, test_user: User, test_user_token: str):
    """
    Test fetching today's workouts.
    """
    response = await async_client.get(
        "/api/workouts/today",
        headers={"Authorization": f"Bearer {test_user_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["exercise_name"] == "squat"
