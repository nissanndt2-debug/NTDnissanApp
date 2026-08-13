import logging

from fastapi import APIRouter, HTTPException, status

from app.config.database import fetchrow

router = APIRouter(prefix="/health", tags=["health"])
logger = logging.getLogger("body_app_backend")


@router.get("")
@router.get("/")
async def health():
    return {"ok": True, "service": "body-app-backend-python"}


@router.get("/db")
async def db_health():
    try:
        row = await fetchrow("SELECT 1 AS ok")
        return {"ok": True, "db": bool(row and row.get("ok") == 1)}
    except Exception:
        logger.exception("Database health check failed")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable")
