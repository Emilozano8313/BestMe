"""
BestMe — Scans Router
=======================
Endpoints for Body Scanner biometric analysis and metabolic feedback loop.
"""

import base64
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.body_scan import BodyScan
from app.models.daily_metric import DailyMetric
from app.schemas.scan import BodyScanResponse
from app.services.vision import VisionService
from app.services.metabolic import MetabolicEngine

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.post("/analyze", response_model=BodyScanResponse)
async def analyze_body_scan(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    1. Evaluates image via GPT-4 Vision for body fat percentage.
    2. Updates User profile (triggering Katch-McArdle transition if previously null).
    3. Overwrites DailyMetric with the new TDEE/Calorie Target.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen")

    try:
        # 1. Image Processing
        contents = await file.read()
        base64_image = base64.b64encode(contents).decode("utf-8")
        
        ai_result = await VisionService.analyze_body_composition(base64_image)
        
        # Privacy: We discard the image and use a placeholder URL in the DB
        dummy_photo_url = "discarded_for_privacy"
        
        # 2. Create BodyScan Record
        new_scan = BodyScan(
            user_id=current_user.id,
            photo_url=dummy_photo_url,
            estimated_body_fat=ai_result["estimated_body_fat"],
            confidence_score=ai_result["confidence_score"],
            scan_metadata=ai_result.get("scan_metadata", {}),
            weight_at_scan_kg=current_user.weight_kg,
        )
        db.add(new_scan)
        
        # 3. Inject body fat into User profile
        current_user.body_fat_percentage = ai_result["estimated_body_fat"]
        current_user.updated_at = datetime.now(timezone.utc)
        db.add(current_user)
        
        # We need to flush so MetabolicEngine has updated data if we passed the user object,
        # but we pass raw values to it anyway.
        await db.flush()

        # 4. Re-calculate Metabolic Profile (Forces Katch-McArdle)
        new_profile = MetabolicEngine.compute_full_profile(
            weight_kg=current_user.weight_kg,
            height_cm=current_user.height_cm,
            date_of_birth=current_user.date_of_birth,
            gender=current_user.gender.value if current_user.gender else "other",
            activity_level=current_user.activity_level.value if current_user.activity_level else "moderate",
            goal=current_user.goal.value if current_user.goal else "maintain",
            body_fat_percentage=current_user.body_fat_percentage,
        )
        
        # 5. Upsert DailyMetric
        today = datetime.now(timezone.utc).date()
        result = await db.execute(
            select(DailyMetric).where(
                DailyMetric.user_id == current_user.id,
                DailyMetric.date == today
            )
        )
        daily_metric = result.scalars().first()
        
        if daily_metric:
            daily_metric.bmr = new_profile.bmr
            daily_metric.tdee = new_profile.tdee
            daily_metric.calorie_target = new_profile.calorie_target
            # Macros targets
            daily_metric.protein_g = new_profile.macros.protein_g
            daily_metric.carbs_g = new_profile.macros.carbs_g
            daily_metric.fat_g = new_profile.macros.fat_g
        else:
            daily_metric = DailyMetric(
                user_id=current_user.id,
                date=today,
                bmr=new_profile.bmr,
                tdee=new_profile.tdee,
                calorie_target=new_profile.calorie_target,
                protein_g=new_profile.macros.protein_g,
                carbs_g=new_profile.macros.carbs_g,
                fat_g=new_profile.macros.fat_g,
            )
            db.add(daily_metric)
            
        await db.commit()
        await db.refresh(new_scan)
        
        # Map to Response
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

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
