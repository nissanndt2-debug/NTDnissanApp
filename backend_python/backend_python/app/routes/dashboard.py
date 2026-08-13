from fastapi import APIRouter, Request

from app.controllers.dashboard_controller import (
    get_defects_by_model,
    get_defects_by_type,
    get_monthly_units_timeline,
    get_weekly_units_by_provider,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/weekly-by-provider")
async def _weekly_by_provider(request: Request):
    user = getattr(request.state, "user", None)
    return await get_weekly_units_by_provider(user)


@router.get("/monthly-timeline")
async def _monthly_timeline(request: Request):
    user = getattr(request.state, "user", None)
    return await get_monthly_units_timeline(user)


@router.get("/defects-by-model")
async def _defects_by_model(request: Request):
    user = getattr(request.state, "user", None)
    return await get_defects_by_model(user)


@router.get("/defects-by-type")
async def _defects_by_type(request: Request, grade: str | None = None):
    user = getattr(request.state, "user", None)
    return await get_defects_by_type(user, grade)
