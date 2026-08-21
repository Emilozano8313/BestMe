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


async def test_distance_route_uses_speed_based_met(async_client: AsyncClient, auth_headers: dict):
    """5 km in 1 h -> 5 km/h walking pace -> MET 3.5 -> 3.5 x 82 x 1 = 287."""
    payload = {
        "exercise_name": "caminar",
        "total_reps": 0,
        "duration_seconds": 3600,
        "distance_km": 5.0,
        "sets": [],
        "analysis_summary": {"source": "recorrido_gps"},
    }
    response = await async_client.post("/api/workouts/", headers=auth_headers, json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["calories_burned"] == 287.0
    assert data["distance_km"] == 5.0


async def test_distance_route_without_distance_falls_back_to_flat_met(
    async_client: AsyncClient, auth_headers: dict
):
    """No distance given -> flat MET_DICTIONARY['correr'] (8.3) -> 8.3 x 82 x 0.5 = 340.3."""
    payload = {
        "exercise_name": "correr",
        "total_reps": 0,
        "duration_seconds": 1800,
        "sets": [],
        "analysis_summary": {},
    }
    response = await async_client.post("/api/workouts/", headers=auth_headers, json=payload)

    assert response.status_code == 200
    assert response.json()["calories_burned"] == 340.3
    assert response.json()["distance_km"] is None


async def test_faster_pace_burns_more_calories_per_hour(async_client: AsyncClient, auth_headers: dict):
    """20 km/h cycling -> MET 8.0, strictly above the <16 km/h tier's MET 4.0."""
    payload = {
        "exercise_name": "ciclismo",
        "total_reps": 0,
        "duration_seconds": 3600,
        "distance_km": 20.0,
        "sets": [],
        "analysis_summary": {},
    }
    response = await async_client.post("/api/workouts/", headers=auth_headers, json=payload)

    assert response.status_code == 200
    assert response.json()["calories_burned"] == 656.0


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


# ═══════════════════════════════════════════════════════════════════
# Workout plan (rule-based, no AI call)
# ═══════════════════════════════════════════════════════════════════
#
# WorkoutPlanner itself is covered in test_workout_planner.py; these tests
# only exercise the endpoint boundary: auth, profile validation, and that
# the response is actually assembled from the engine's output.


async def test_get_workout_plan_home(async_client: AsyncClient, auth_headers: dict):
    response = await async_client.get("/api/workouts/plan?location=home", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["location"] == "home"
    assert len(body["exercises"]) >= 4
    assert body["estimated_duration_minutes"] > 0
    # test_user has weight_kg set, so a calorie estimate must come back.
    assert body["estimated_calories_burned"] is not None

    assert len(body["warmup_exercises"]) > 0
    assert sum(step["duration_seconds"] for step in body["warmup_exercises"]) == (
        body["warmup_minutes"] * 60
    )


async def test_get_workout_plan_gym(async_client: AsyncClient, auth_headers: dict):
    response = await async_client.get("/api/workouts/plan?location=gym", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["location"] == "gym"


async def test_get_workout_plan_rejects_bad_location(async_client: AsyncClient, auth_headers: dict):
    response = await async_client.get("/api/workouts/plan?location=beach", headers=auth_headers)
    assert response.status_code == 422


async def test_get_workout_plan_requires_authentication(async_client: AsyncClient):
    response = await async_client.get("/api/workouts/plan?location=home")
    assert response.status_code == 401


async def test_get_workout_plan_with_focus_returns_only_that_group(
    async_client: AsyncClient, auth_headers: dict
):
    response = await async_client.get(
        "/api/workouts/plan?location=gym&focus=push", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["focus"] == "push"
    assert len(body["exercises"]) > 0
    assert all(ex["muscle_group"] == "push" for ex in body["exercises"])


async def test_get_workout_plan_rejects_bad_focus(async_client: AsyncClient, auth_headers: dict):
    response = await async_client.get(
        "/api/workouts/plan?location=home&focus=neck", headers=auth_headers
    )
    assert response.status_code == 422


async def test_get_workout_plan_omits_focus_by_default(
    async_client: AsyncClient, auth_headers: dict
):
    response = await async_client.get("/api/workouts/plan?location=home", headers=auth_headers)
    assert response.json()["focus"] is None


async def test_get_workout_plan_requires_a_complete_profile(
    async_client: AsyncClient, auth_headers: dict, test_user: User, db_session
):
    test_user.goal = None
    db_session.add(test_user)
    await db_session.commit()

    response = await async_client.get("/api/workouts/plan?location=home", headers=auth_headers)

    assert response.status_code == 400
    assert "objetivo" in response.json()["detail"]
