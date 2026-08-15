"""
BestMe — Meals Tests
======================
Covers AI analysis, saving a meal, and how meals aggregate into
`daily_metrics`.

Every test is self-contained: the previous version relied on state left
behind by earlier tests, which breaks the moment tests are isolated,
reordered, or run individually.
"""

from datetime import datetime, timezone

from httpx import AsyncClient
from sqlalchemy import select

from app.models.daily_metric import DailyMetric
from app.models.user import User

LUNCH = {
    "meal_type": "lunch",
    "description": "Prueba de comida",
    "detected_foods": [
        {"food": "Pollo", "weight_g": 200, "calories": 330, "protein_g": 60, "carbs_g": 0, "fat_g": 7},
        {"food": "Arroz", "weight_g": 100, "calories": 130, "protein_g": 2, "carbs_g": 28, "fat_g": 0},
    ],
    "manually_adjusted": True,
}


async def test_analyze_meal_image_returns_labelled_sample_without_api_key(
    async_client: AsyncClient, auth_headers: dict
):
    """Without an API key the endpoint returns sample data, clearly flagged."""
    response = await async_client.post(
        "/api/meals/analyze",
        headers=auth_headers,
        files={"file": ("test.jpg", b"fakeimagecontent", "image/jpeg")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["is_mock"] is True, "sample data must be distinguishable from a real analysis"
    assert len(data["foods"]) > 0
    assert data["foods"][0]["confidence"] == 0.0
    assert "[EJEMPLO]" in data["foods"][0]["food"]


async def test_analyze_rejects_non_image(async_client: AsyncClient, auth_headers: dict):
    response = await async_client.post(
        "/api/meals/analyze",
        headers=auth_headers,
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400


async def test_analyze_rejects_oversized_image(async_client: AsyncClient, auth_headers: dict):
    from app.core.uploads import MAX_IMAGE_BYTES

    response = await async_client.post(
        "/api/meals/analyze",
        headers=auth_headers,
        files={"file": ("huge.jpg", b"x" * (MAX_IMAGE_BYTES + 1), "image/jpeg")},
    )
    assert response.status_code == 413


async def test_analyze_requires_authentication(async_client: AsyncClient):
    response = await async_client.post(
        "/api/meals/analyze",
        files={"file": ("test.jpg", b"x", "image/jpeg")},
    )
    assert response.status_code == 401


async def test_create_meal_accumulates_into_daily_metrics(
    async_client: AsyncClient, auth_headers: dict, test_user: User, db_session
):
    response = await async_client.post("/api/meals/", headers=auth_headers, json=LUNCH)

    assert response.status_code == 201
    body = response.json()
    assert body["total_calories"] == 460
    assert body["total_protein_g"] == 62
    assert body["meal_type"] == "lunch"

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
    assert metric.calories_consumed == 460
    assert metric.protein_g == 62
    assert metric.carbs_g == 28


async def test_two_meals_sum_rather_than_overwrite(
    async_client: AsyncClient, auth_headers: dict, test_user: User, db_session
):
    await async_client.post("/api/meals/", headers=auth_headers, json=LUNCH)
    await async_client.post("/api/meals/", headers=auth_headers, json=LUNCH)

    today = datetime.now(timezone.utc).date()
    metric = (
        await db_session.execute(
            select(DailyMetric).where(
                DailyMetric.user_id == test_user.id,
                DailyMetric.date == today,
            )
        )
    ).scalars().first()

    assert metric.calories_consumed == 920
    assert metric.protein_g == 124


async def test_get_todays_meals(async_client: AsyncClient, auth_headers: dict):
    await async_client.post("/api/meals/", headers=auth_headers, json=LUNCH)

    response = await async_client.get("/api/meals/today", headers=auth_headers)

    assert response.status_code == 200
    meals = response.json()
    assert len(meals) == 1
    assert meals[0]["meal_type"] == "lunch"
    assert meals[0]["total_calories"] == 460


async def test_delete_meal_subtracts_from_daily_metrics(
    async_client: AsyncClient, auth_headers: dict, test_user: User, db_session
):
    created = await async_client.post("/api/meals/", headers=auth_headers, json=LUNCH)
    meal_id = created.json()["id"]

    response = await async_client.delete(f"/api/meals/{meal_id}", headers=auth_headers)
    assert response.status_code == 204

    today = datetime.now(timezone.utc).date()
    metric = (
        await db_session.execute(
            select(DailyMetric).where(
                DailyMetric.user_id == test_user.id,
                DailyMetric.date == today,
            )
        )
    ).scalars().first()

    assert metric.calories_consumed == 0
    assert metric.protein_g == 0
