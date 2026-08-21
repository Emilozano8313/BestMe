"""
BestMe — History & Weight Tests
=================================
Covers the series that feeds the progress charts and the weight check-in.
"""

from datetime import date, datetime, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy import select

from app.models.daily_metric import DailyMetric
from app.models.user import User

MEAL = {
    "meal_type": "lunch",
    "detected_foods": [
        {"food": "Pollo", "weight_g": 200, "calories": 400, "protein_g": 50, "carbs_g": 10, "fat_g": 12}
    ],
    "manually_adjusted": False,
}


async def test_history_returns_a_continuous_series(
    async_client: AsyncClient, auth_headers: dict
):
    """
    Days without data come back as zeros, not as gaps.

    A chart needs an even time axis; if the API omitted empty days the client
    would have to reconstruct the calendar itself, and an off-by-one there
    silently shifts every point.
    """
    response = await async_client.get("/api/metrics/history?days=7", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body["points"]) == 7

    days = [point["date"] for point in body["points"]]
    assert days == sorted(days), "la serie debe venir ordenada"
    assert days[-1] == datetime.now(timezone.utc).date().isoformat(), "el último punto es hoy"

    # Consecutive, no holes.
    parsed = [date.fromisoformat(d) for d in days]
    for earlier, later in zip(parsed, parsed[1:]):
        assert (later - earlier).days == 1


async def test_history_reflects_logged_meals(async_client: AsyncClient, auth_headers: dict):
    await async_client.post("/api/meals/", headers=auth_headers, json=MEAL)

    body = (
        await async_client.get("/api/metrics/history?days=7", headers=auth_headers)
    ).json()

    today_point = body["points"][-1]
    assert today_point["calories_consumed"] == 400
    assert today_point["protein_g"] == 50
    assert today_point["meal_count"] == 1

    assert body["summary"]["days_with_data"] == 1
    assert body["summary"]["avg_calories_consumed"] == 400


async def test_history_rejects_an_out_of_range_window(
    async_client: AsyncClient, auth_headers: dict
):
    assert (await async_client.get("/api/metrics/history?days=0", headers=auth_headers)).status_code == 422
    assert (await async_client.get("/api/metrics/history?days=999", headers=auth_headers)).status_code == 422


async def test_log_weight_updates_profile_and_target(
    async_client: AsyncClient, auth_headers: dict, test_user: User, db_session
):
    before = (await async_client.get("/api/metrics/profile", headers=auth_headers)).json()

    response = await async_client.post(
        "/api/metrics/weight", headers=auth_headers, json={"weight_kg": 78.5}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["weight_kg"] == 78.5
    assert body["date"] == datetime.now(timezone.utc).date().isoformat()

    # Weight feeds the BMR equation, so the target must move.
    assert body["metabolic_profile"]["calorie_target"] < before["calorie_target"]

    await db_session.refresh(test_user)
    assert test_user.weight_kg == 78.5


async def test_logged_weight_appears_in_history(async_client: AsyncClient, auth_headers: dict):
    await async_client.post(
        "/api/metrics/weight", headers=auth_headers, json={"weight_kg": 80.0}
    )

    body = (
        await async_client.get("/api/metrics/history?days=7", headers=auth_headers)
    ).json()

    assert body["points"][-1]["weight_kg"] == 80.0
    assert body["summary"]["latest_weight_kg"] == 80.0


async def test_weight_change_is_computed_across_the_window(
    async_client: AsyncClient, auth_headers: dict
):
    three_days_ago = (datetime.now(timezone.utc).date() - timedelta(days=3)).isoformat()

    await async_client.post(
        "/api/metrics/weight",
        headers=auth_headers,
        json={"weight_kg": 84.0, "date": three_days_ago},
    )
    await async_client.post(
        "/api/metrics/weight", headers=auth_headers, json={"weight_kg": 81.5}
    )

    body = (
        await async_client.get("/api/metrics/history?days=7", headers=auth_headers)
    ).json()

    assert body["summary"]["weight_change_kg"] == -2.5


async def test_backfilled_weight_does_not_rewrite_todays_profile(
    async_client: AsyncClient, auth_headers: dict, test_user: User, db_session
):
    """Filling in a missed day must not change what the user weighs today."""
    original = test_user.weight_kg
    past = (datetime.now(timezone.utc).date() - timedelta(days=5)).isoformat()

    await async_client.post(
        "/api/metrics/weight",
        headers=auth_headers,
        json={"weight_kg": 95.0, "date": past},
    )

    await db_session.refresh(test_user)
    assert test_user.weight_kg == original


async def test_weight_rejects_future_dates(async_client: AsyncClient, auth_headers: dict):
    tomorrow = (datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat()
    response = await async_client.post(
        "/api/metrics/weight",
        headers=auth_headers,
        json={"weight_kg": 80.0, "date": tomorrow},
    )
    assert response.status_code == 400


async def test_weight_rejects_impossible_values(async_client: AsyncClient, auth_headers: dict):
    for value in (5.0, 500.0):
        response = await async_client.post(
            "/api/metrics/weight", headers=auth_headers, json={"weight_kg": value}
        )
        assert response.status_code == 422, f"{value} kg debería rechazarse"


async def test_days_on_target_counts_only_days_within_ten_percent(
    async_client: AsyncClient, auth_headers: dict, test_user: User, db_session
):
    # Onboarding-style row: a target with intake right on it.
    metric = DailyMetric(
        user_id=test_user.id,
        date=datetime.now(timezone.utc).date(),
        calorie_target=2000.0,
        calories_consumed=1950.0,
    )
    db_session.add(metric)
    await db_session.commit()

    body = (
        await async_client.get("/api/metrics/history?days=7", headers=auth_headers)
    ).json()

    assert body["summary"]["days_on_target"] == 1
