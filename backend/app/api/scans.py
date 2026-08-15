"""
BestMe — Scans Router
=======================
Body scanner analysis and the metabolic feedback loop.

Split into two steps on purpose. Estimating body fat from a photo carries a
several-point margin of error, and accepting an estimate rewrites the user's
calorie target for every day that follows — so `/analyze` only previews, and
nothing is persisted until the user confirms via `/confirm`.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.core.uploads import read_image_upload
from app.database import get_db
from app.models.body_scan import BodyScan
from app.models.daily_metric import DailyMetric
from app.models.user import User
from app.schemas.scan import (
    MIN_USABLE_CONFIDENCE,
    BodyScanResponse,
    ScanConfirmRequest,
    ScanPreviewResponse,
)
from app.services.metabolic import MetabolicEngine
from app.services.vision import VisionError, VisionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scans", tags=["scans"])


def _require_complete_profile(user: User) -> None:
    """A body-fat estimate is only actionable with the rest of the profile."""
    missing = [
        name
        for name, value in (
            ("peso", user.weight_kg),
            ("altura", user.height_cm),
            ("fecha de nacimiento", user.date_of_birth),
        )
        if value is None
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Completa tu perfil primero. Falta: {', '.join(missing)}.",
        )


def _compute_profile(user: User, body_fat: float | None):
    """Run the metabolic engine for a given body fat percentage."""
    return MetabolicEngine.compute_full_profile(
        weight_kg=user.weight_kg,
        height_cm=user.height_cm,
        date_of_birth=user.date_of_birth,
        gender=user.gender.value if user.gender else "other",
        activity_level=user.activity_level.value if user.activity_level else "moderate",
        goal=user.goal.value if user.goal else "maintain",
        body_fat_percentage=body_fat,
    )


@router.post("/analyze", response_model=ScanPreviewResponse)
async def analyze_body_scan(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Estimate body fat from a photo and preview the resulting profile.

    Persists nothing. The photo itself is never stored — it is held in memory
    for the duration of the request and discarded.
    """
    _require_complete_profile(current_user)
    base64_image, media_type = await read_image_upload(file)

    try:
        result = await VisionService.analyze_body_composition(base64_image, media_type)
    except VisionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except Exception:
        logger.exception("Unexpected failure analysing body scan")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo analizar la imagen.",
        )

    body_fat = float(result["estimated_body_fat"])
    confidence = float(result.get("confidence_score", 0.0))
    is_mock = bool(result.get("is_mock", False))
    is_reliable = (not is_mock) and confidence >= MIN_USABLE_CONFIDENCE

    projected = _compute_profile(current_user, body_fat)

    return ScanPreviewResponse(
        estimated_body_fat=round(body_fat, 1),
        confidence_score=round(confidence, 2),
        notes=str(result.get("notes", "")),
        limiting_factors=list(result.get("limiting_factors", [])),
        is_reliable=is_reliable,
        is_mock=is_mock,
        projected_bmr=projected.bmr,
        projected_tdee=projected.tdee,
        projected_calorie_target=projected.calorie_target,
        projected_equation=projected.equation_used.value,
    )


@router.post("/confirm", response_model=BodyScanResponse, status_code=status.HTTP_201_CREATED)
async def confirm_body_scan(
    payload: ScanConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Apply a body fat percentage the user has reviewed.

    1. Saves the scan record (no photo — discarded for privacy).
    2. Updates the user's body_fat_percentage, which switches the metabolic
       engine from Mifflin-St Jeor to Katch-McArdle.
    3. Rewrites today's targets in `daily_metrics`.
    """
    _require_complete_profile(current_user)

    new_scan = BodyScan(
        user_id=current_user.id,
        photo_url="discarded_for_privacy",
        estimated_body_fat=payload.estimated_body_fat,
        confidence_score=payload.confidence_score,
        scan_metadata={"notes": payload.notes} if payload.notes else {},
        weight_at_scan_kg=current_user.weight_kg,
    )
    db.add(new_scan)

    current_user.body_fat_percentage = payload.estimated_body_fat
    current_user.updated_at = datetime.now(timezone.utc)
    db.add(current_user)
    await db.flush()

    new_profile = _compute_profile(current_user, payload.estimated_body_fat)

    today = datetime.now(timezone.utc).date()
    result = await db.execute(
        select(DailyMetric).where(
            DailyMetric.user_id == current_user.id,
            DailyMetric.date == today,
        )
    )
    daily_metric = result.scalars().first()

    if daily_metric is None:
        daily_metric = DailyMetric(user_id=current_user.id, date=today)
        db.add(daily_metric)

    daily_metric.bmr = new_profile.bmr
    daily_metric.tdee = new_profile.tdee
    daily_metric.calorie_target = new_profile.calorie_target
    # Targets only — protein_g/carbs_g/fat_g hold what the user ate today.
    daily_metric.target_protein_g = new_profile.macros.protein_g
    daily_metric.target_carbs_g = new_profile.macros.carbs_g
    daily_metric.target_fat_g = new_profile.macros.fat_g

    await db.commit()
    await db.refresh(new_scan)

    return BodyScanResponse(
        id=new_scan.id,
        estimated_body_fat=new_scan.estimated_body_fat,
        confidence_score=new_scan.confidence_score,
        weight_at_scan_kg=new_scan.weight_at_scan_kg,
        scanned_at=new_scan.scanned_at,
        new_tdee=new_profile.tdee,
        new_bmr=new_profile.bmr,
        new_calorie_target=new_profile.calorie_target,
        equation_used=new_profile.equation_used.value,
    )
