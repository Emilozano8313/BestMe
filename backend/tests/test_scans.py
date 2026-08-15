"""
BestMe — Scans Tests
======================
Unit tests for the biometric body scanner and the metabolic feedback loop.
"""

import pytest
from httpx import AsyncClient
from datetime import datetime, timezone
from sqlalchemy import select

from app.models.user import User
from app.models.daily_metric import DailyMetric


@pytest.mark.asyncio
async def test_body_scan_and_metabolic_transition(async_client: AsyncClient, test_user: User, test_user_token: str, db_session):
    """
    Test that uploading a body scan photo updates the user's body_fat_percentage
    and transitions the metabolic equation from Mifflin-St Jeor to Katch-McArdle,
    updating the daily metrics.
    """
    # 1. Setup user with basic stats but NO body_fat_percentage (uses Mifflin-St Jeor)
    test_user.weight_kg = 80.0
    test_user.height_cm = 180.0
    test_user.date_of_birth = datetime(1990, 1, 1).date()
    test_user.body_fat_percentage = None
    db_session.add(test_user)
    await db_session.commit()

    # Create dummy image
    dummy_image_content = b"fake_image_data"

    # Send scan request (mock API key returns mock AI response)
    response = await async_client.post(
        "/api/scans/analyze",
        headers={"Authorization": f"Bearer {test_user_token}"},
        files={"file": ("test.jpg", dummy_image_content, "image/jpeg")}
    )

    assert response.status_code == 200
    data = response.json()
    
    # Verify AI estimation mapped properly
    assert "estimated_body_fat" in data
    assert data["equation_used"] == "Katch-McArdle" # Successfully transitioned!
    
    # 2. Check that the User profile was updated in the DB
    await db_session.refresh(test_user)
    assert test_user.body_fat_percentage == data["estimated_body_fat"]

    # 3. Check that the DailyMetric was upserted with new BMR/TDEE
    today = datetime.now(timezone.utc).date()
    metric_query = await db_session.execute(
        select(DailyMetric).where(DailyMetric.user_id == test_user.id, DailyMetric.date == today)
    )
    metric = metric_query.scalars().first()
    
    assert metric is not None
    assert metric.bmr == data["new_bmr"]
    assert metric.tdee == data["new_tdee"]
    assert metric.calorie_target == data["new_calorie_target"]
