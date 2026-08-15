"""
BestMe — Auth & Enum Persistence Tests
========================================
Covers registration, login, the profile endpoints, and — critically — that
enum columns round-trip.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text

from app.models.user import ActivityLevel, FitnessGoal, Gender, User

NEW_USER = {
    "email": "nuevo@bestme.app",
    "password": "unaContraseñaSegura123",
    "full_name": "Persona Nueva",
    "gender": "male",
    "activity_level": "moderate",
    "goal": "gain_muscle",
    "height_cm": 180.0,
    "weight_kg": 75.0,
}


async def test_register_with_enum_fields(async_client: AsyncClient, db_session):
    """
    Regression test for the enum bug.

    SQLAlchemy persists a Python enum's *name* by default ("MALE"), while the
    migrations build the PostgreSQL types from the *values* ('male'). Every
    INSERT touching gender / activity_level / goal / meal_type failed until
    `values_callable` was added, so registering a user simply did not work.
    """
    response = await async_client.post("/api/auth/register", json=NEW_USER)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["email"] == NEW_USER["email"]
    assert body["gender"] == "male"
    assert body["activity_level"] == "moderate"
    assert body["goal"] == "gain_muscle"

    user = (
        await db_session.execute(select(User).where(User.email == NEW_USER["email"]))
    ).scalar_one()
    assert user.gender is Gender.MALE
    assert user.activity_level is ActivityLevel.MODERATE
    assert user.goal is FitnessGoal.GAIN_MUSCLE


@pytest.mark.parametrize(
    "column, expected",
    [("gender", "male"), ("activity_level", "moderate"), ("goal", "gain_muscle")],
)
async def test_enum_columns_store_values_not_member_names(
    async_client: AsyncClient, db_session, column: str, expected: str
):
    """
    The bytes on disk must be the enum *value*.

    Asserting through the ORM is not enough — it would decode 'MALE' back to
    Gender.MALE and hide the mismatch. PostgreSQL would reject the write
    outright with `invalid input value for enum`.
    """
    await async_client.post("/api/auth/register", json=NEW_USER)

    raw = (
        await db_session.execute(
            text(f"SELECT {column} FROM users WHERE email = :email"),
            {"email": NEW_USER["email"]},
        )
    ).scalar_one()

    assert raw == expected, f"se guardó {raw!r}; la BD sólo acepta {expected!r}"


async def test_register_rejects_duplicate_email(async_client: AsyncClient):
    await async_client.post("/api/auth/register", json=NEW_USER)
    response = await async_client.post("/api/auth/register", json=NEW_USER)
    assert response.status_code == 400


async def test_login_returns_both_tokens(async_client: AsyncClient):
    await async_client.post("/api/auth/register", json=NEW_USER)

    response = await async_client.post(
        "/api/auth/login",
        data={"username": NEW_USER["email"], "password": NEW_USER["password"]},
    )

    assert response.status_code == 200
    tokens = response.json()
    assert tokens["access_token"] and tokens["refresh_token"]
    assert tokens["token_type"] == "bearer"


async def test_login_with_wrong_password_is_rejected(async_client: AsyncClient):
    await async_client.post("/api/auth/register", json=NEW_USER)

    response = await async_client.post(
        "/api/auth/login",
        data={"username": NEW_USER["email"], "password": "incorrecta"},
    )
    assert response.status_code == 401


async def test_refresh_token_issues_a_new_access_token(async_client: AsyncClient):
    await async_client.post("/api/auth/register", json=NEW_USER)
    login = await async_client.post(
        "/api/auth/login",
        data={"username": NEW_USER["email"], "password": NEW_USER["password"]},
    )
    refresh_token = login.json()["refresh_token"]

    response = await async_client.post(
        "/api/auth/refresh", json={"refresh_token": refresh_token}
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


async def test_access_token_is_rejected_as_a_refresh_token(async_client: AsyncClient):
    """Token `type` must be enforced, or an access token could be replayed forever."""
    await async_client.post("/api/auth/register", json=NEW_USER)
    login = await async_client.post(
        "/api/auth/login",
        data={"username": NEW_USER["email"], "password": NEW_USER["password"]},
    )

    response = await async_client.post(
        "/api/auth/refresh", json={"refresh_token": login.json()["access_token"]}
    )
    assert response.status_code == 401


async def test_get_and_patch_me(async_client: AsyncClient, auth_headers: dict, test_user: User):
    me = await async_client.get("/api/auth/me", headers=auth_headers)
    assert me.status_code == 200
    assert me.json()["email"] == test_user.email

    patched = await async_client.patch(
        "/api/auth/me", headers=auth_headers, json={"weight_kg": 79.5}
    )
    assert patched.status_code == 200
    assert patched.json()["weight_kg"] == 79.5


async def test_patch_me_with_empty_body_is_rejected(
    async_client: AsyncClient, auth_headers: dict
):
    response = await async_client.patch("/api/auth/me", headers=auth_headers, json={})
    assert response.status_code == 400


async def test_patch_me_updates_the_metabolic_profile(
    async_client: AsyncClient, auth_headers: dict
):
    """Weight feeds the engine, so changing it must move the calorie target."""
    before = (await async_client.get("/api/metrics/profile", headers=auth_headers)).json()

    await async_client.patch("/api/auth/me", headers=auth_headers, json={"weight_kg": 95.0})

    after = (await async_client.get("/api/metrics/profile", headers=auth_headers)).json()
    assert after["calorie_target"] > before["calorie_target"]
