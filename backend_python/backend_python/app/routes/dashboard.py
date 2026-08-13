from fastapi import APIRouter, Depends

from app.controllers.dashboard_controller import (
    get_defects_by_model,
    get_defects_by_type,
    get_monthly_units_timeline,
    get_repair_time_by_model,
    get_repair_time_by_provider,
    get_weekly_units_by_provider,
)
from app.middleware.auth import require_role

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/weekly-by-provider")
async def _weekly_by_provider(user: dict = Depends(require_role("ADMIN"))):
    return await get_weekly_units_by_provider(user)


@router.get("/monthly-timeline")
async def _monthly_timeline(user: dict = Depends(require_role("ADMIN"))):
    return await get_monthly_units_timeline(user)


@router.get("/defects-by-model")
async def _defects_by_model(user: dict = Depends(require_role("ADMIN"))):
    return await get_defects_by_model(user)


@router.get("/repair-time-by-provider")
async def _repair_time_by_provider(user: dict = Depends(require_role("ADMIN"))):
    return await get_repair_time_by_provider(user)


@router.get("/repair-time-by-model")
async def _repair_time_by_model(user: dict = Depends(require_role("ADMIN"))):
    return await get_repair_time_by_model(user)


@router.get("/defects-by-type")
async def _defects_by_type(grade: str | None = None, user: dict = Depends(require_role("ADMIN"))):
    return await get_defects_by_type(user, grade)
