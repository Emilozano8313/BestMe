"""
BestMe — Scans Tests
======================
Covers the two-step body scan: `/analyze` previews an estimate without
touching anything, `/confirm` applies it and switches the metabolic engine
from Mifflin-St Jeor to Katch-McArdle.
"""

from datetime import datetime, timezone

from httpx import AsyncClient
from sqlalchemy import select

from app.models.daily_metric import DailyMetric
from app.models.user import User

IMAGE = {"file": ("scan.jpg", b"fake_image_data", "image/jpeg")}


async def test_analyze_previews_without_persisting_anything(
    async_client: AsyncClient, auth_headers: dict, test_user: User, db_session
):
    """/analyze must not change the user's profile — that needs confirmation."""
    assert test_user.body_fat_percentage is None

    response = await async_client.post("/api/scans/analyze", headers=auth_headers, files=IMAGE)

    assert response.status_code == 200
    data = response.json()
    assert "estimated_body_fat" in data
    assert data["projected_equation"] == "katch_mcardle"
    # Sample data (no API key) must never be presented as actionable.
    assert data["is_mock"] is True
    assert data["is_reliable"] is False

    await db_session.refresh(test_user)
    assert test_user.body_fat_percentage is None, "/analyze must not write to the profile"


async def test_analyze_requires_a_complete_profile(
    async_client: AsyncClient, auth_headers: dict, test_user: User, db_session
):
    test_user.weight_kg = None
    db_session.add(test_user)
    await db_session.commit()

    response = await async_client.post("/api/scans/analyze", headers=auth_headers, files=IMAGE)

    assert response.status_code == 400
    assert "peso" in response.json()["detail"]


async def test_confirm_applies_scan_and_switches_equation(
    async_client: AsyncClient, auth_headers: dict, test_user: User, db_session
):
    response = await async_client.post(
        "/api/scans/confirm",
        headers=auth_headers,
        json={"estimated_body_fat": 18.5, "confidence_score": 0.8, "notes": "prueba"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["estimated_body_fat"] == 18.5
    assert data["equation_used"] == "katch_mcardle", "body fat present -> Katch-McArdle"

    await db_session.refresh(test_user)
    assert test_user.body_fat_percentage == 18.5

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
    assert metric.bmr == data["new_bmr"]
    assert metric.tdee == data["new_tdee"]
    assert metric.calorie_target == data["new_calorie_target"]


async def test_confirming_a_scan_does_not_erase_the_days_food_log(
    async_client: AsyncClient, auth_headers: dict, test_user: User, db_session
):
    """
    Regression test for the data-corruption bug.

    `daily_metrics.protein_g/carbs_g/fat_g` used to hold both consumed and
    target macros, so confirming a scan wiped whatever the user had eaten.
    """
    meal = {
        "meal_type": "breakfast",
        "detected_foods": [
            {"food": "Avena", "weight_g": 80, "calories": 300, "protein_g": 10, "carbs_g": 54, "fat_g": 6}
        ],
        "manually_adjusted": False,
    }
    await async_client.post("/api/meals/", headers=auth_headers, json=meal)

    await async_client.post(
        "/api/scans/confirm",
        headers=auth_headers,
        json={"estimated_body_fat": 18.5, "confidence_score": 0.8},
    )

    today = datetime.now(timezone.utc).date()
    metric = (
        await db_session.execute(
            select(DailyMetric).where(
                DailyMetric.user_id == test_user.id,
                DailyMetric.date == today,
            )
        )
    ).scalars().first()

    # Consumed values survive untouched...
    assert metric.calories_consumed == 300
    assert metric.protein_g == 10
    assert metric.carbs_g == 54
    assert metric.fat_g == 6

    # ...and the targets live in their own columns.
    assert metric.target_protein_g is not None
    assert metric.target_protein_g != metric.protein_g


async def test_confirm_rejects_impossible_body_fat(async_client: AsyncClient, auth_headers: dict):
    response = await async_client.post(
        "/api/scans/confirm",
        headers=auth_headers,
        json={"estimated_body_fat": 150.0},
    )
    assert response.status_code == 422
