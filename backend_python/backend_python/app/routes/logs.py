from fastapi import APIRouter, Query, Request
from fastapi.responses import Response
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.controllers.status_history_controller import export_logs_to_excel, get_logs


MX_TIMEZONE = ZoneInfo("America/Mexico_City")

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/")
async def _get_logs(request: Request, registeredById: int | None = None, market: str | None = None, vin: str | None = None, startDate: str | None = None, endDate: str | None = None, sort: str | None = None, order: str | None = None, limit: int | None = Query(default=None), plant: str | None = None):
    filters = {
        "registeredById": registeredById,
        "market": market,
        "vin": vin,
        "startDate": startDate,
        "endDate": endDate,
        "sort": sort,
        "order": order,
        "limit": limit,
        "plant": plant,
    }
    user = getattr(request.state, "user", None)
    return await get_logs(filters, user)


@router.get("/export")
async def _export_logs(request: Request, registeredById: int | None = None, market: str | None = None, vin: str | None = None, startDate: str | None = None, endDate: str | None = None, sort: str | None = None, order: str | None = None, limit: int | None = Query(default=None), plant: str | None = None):
    filters = {
        "registeredById": registeredById,
        "market": market,
        "vin": vin,
        "startDate": startDate,
        "endDate": endDate,
        "sort": sort,
        "order": order,
        "limit": limit,
        "plant": plant,
    }
    user = getattr(request.state, "user", None)
    content = await export_logs_to_excel(filters, user)
    file_date = datetime.now(timezone.utc).astimezone(MX_TIMEZONE).strftime("%Y-%m-%d")
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=historial-unidades-{file_date}.xlsx"},
    )
