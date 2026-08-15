"""
BestMe — Meals Tests
======================
Unit tests for the meals API endpoints (Phase 4).
"""

import pytest
from httpx import AsyncClient
from datetime import datetime, timezone

from app.models.user import User, ActivityLevel, FitnessGoal
from app.models.daily_metric import DailyMetric
from app.models.meal import MealType


@pytest.mark.asyncio
async def test_analyze_meal_image_mock(async_client: AsyncClient, test_user: User, test_user_token: str):
    """
    Test that the /analyze endpoint works and returns the mocked food list
    when the OpenAI API key is missing or set to mock.
    """
    # Create a dummy small image
    dummy_image = b"fakeimagecontent"
    
    response = await async_client.post(
        "/api/meals/analyze",
        headers={"Authorization": f"Bearer {test_user_token}"},
        files={"file": ("test.jpg", dummy_image, "image/jpeg")}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "foods" in data
    assert len(data["foods"]) > 0
    assert "weight_g" in data["foods"][0]


@pytest.mark.asyncio
async def test_create_meal_and_update_metrics(async_client: AsyncClient, test_user: User, test_user_token: str, db_session):
    """
    Test that saving a meal correctly accumulates macros in DailyMetric.
    """
    meal_data = {
        "meal_type": "lunch",
        "description": "Prueba de comida",
        "detected_foods": [
            {
                "food": "Pollo",
                "weight_g": 200,
                "calories": 330,
                "protein_g": 60,
                "carbs_g": 0,
                "fat_g": 7
            },
            {
                "food": "Arroz",
                "weight_g": 100,
                "calories": 130,
                "protein_g": 2,
                "carbs_g": 28,
                "fat_g": 0
            }
        ],
        "manually_adjusted": True
    }

    response = await async_client.post(
        "/api/meals/",
        headers={"Authorization": f"Bearer {test_user_token}"},
        json=meal_data
    )

    assert response.status_code == 200
    res_data = response.json()
    assert res_data["total_calories"] == 460
    assert res_data["total_protein_g"] == 62

    # Verify that DailyMetric was updated
    from sqlalchemy import select
    today = datetime.now(timezone.utc).date()
    metric_query = await db_session.execute(
        select(DailyMetric).where(DailyMetric.user_id == test_user.id, DailyMetric.date == today)
    )
    metric = metric_query.scalars().first()
    
    assert metric is not None
    assert metric.calories_consumed == 460
    assert metric.protein_g == 62
    assert metric.carbs_g == 28


@pytest.mark.asyncio
async def test_get_todays_meals(async_client: AsyncClient, test_user: User, test_user_token: str):
    """
    Test fetching the meals for the current day.
    """
    response = await async_client.get(
        "/api/meals/today",
        headers={"Authorization": f"Bearer {test_user_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # At least one meal should exist from the previous test
    assert len(data) >= 1
    assert data[0]["meal_type"] == "lunch"
